import axios from 'axios';
import { log, error, warn } from './logger';
import { QuoteResult, NordsternQuoteResponse } from './types';

const NORDSTERN_API_BASE = 'https://api.nordstern.finance/aggregator';

const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'stablejet-monitor/1.0'
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Nordstern 速率限制器 - 0.5 RPS (5 requests / 10 seconds)
class NordsternRateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequests = 5;
  private readonly windowMs = 10000;
  private readonly minInterval = 2000;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);

    while (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100;
      log(`[Nordstern] Rate limit reached (${this.requestTimes.length}/${this.maxRequests}), waiting ${waitTime}ms...`);
      await delay(waitTime);
      const newNow = Date.now();
      this.requestTimes = this.requestTimes.filter(time => newNow - time < this.windowMs);
    }

    if (this.requestTimes.length > 0) {
      const lastRequest = this.requestTimes[this.requestTimes.length - 1];
      const timeSinceLastRequest = now - lastRequest;
      if (timeSinceLastRequest < this.minInterval) {
        const waitTime = this.minInterval - timeSinceLastRequest;
        await delay(waitTime);
      }
    }

    this.requestTimes.push(Date.now());
  }

  getStatus(): { current: number; max: number; rate: string } {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    return {
      current: this.requestTimes.length,
      max: this.maxRequests,
      rate: '0.5 RPS (5 req/10s)'
    };
  }
}

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.nordstern.ratelimiter');
const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new NordsternRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function requestWithRetry(url: string, maxRetries = 3): Promise<NordsternQuoteResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await rateLimiter.waitForSlot();
      const response = await axiosInstance.get<NordsternQuoteResponse>(url);
      return response.data;
    } catch (err: any) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const waitTime = Math.pow(2, attempt) * 2000;
        const status = rateLimiter.getStatus();
        warn(`[Nordstern] Rate limit hit (429), attempt ${attempt + 1}/${maxRetries}, current: ${status.current}/${status.max}, waiting ${waitTime}ms...`);
        if (attempt < maxRetries - 1) {
          await delay(waitTime);
          continue;
        }
      }

      if (axios.isAxiosError(err)) {
        error(`[Nordstern] Axios error on attempt ${attempt + 1}/${maxRetries}: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}`);
      } else {
        error(`[Nordstern] Error on attempt ${attempt + 1}/${maxRetries}:`, err instanceof Error ? err.message : 'Unknown error');
      }

      if (attempt === maxRetries - 1) {
        throw err;
      }

      await delay(1000 * (attempt + 1));
    }
  }

  throw new Error('Max retries reached');
}

export async function getNordsternQuoteByChainKey(
  chainId: string,
  inTokenAddress: string,
  outTokenAddress: string,
  amountDecimals: string
): Promise<QuoteResult> {
  if (!chainId) {
    error('[Nordstern] Missing chainId');
    return { success: false, error: 'Nordstern missing chainId' };
  }

  const url = `${NORDSTERN_API_BASE}/${chainId}`;
  const params = new URLSearchParams({
    src: inTokenAddress,
    dst: outTokenAddress,
    amount: amountDecimals
  });

  try {
    const status = rateLimiter.getStatus();
    log(`[Nordstern] Requesting quote for ${chainId} (rate: ${status.current}/${status.max} @ ${status.rate}): ${inTokenAddress.slice(0, 6)}...→${outTokenAddress.slice(0, 6)}...`);

    const data = await requestWithRetry(`${url}?${params}`);

    if (data?.toAmount) {
      log(`[Nordstern] ✓ Success for ${chainId}: ${data.toAmount} out`);
      return {
        success: true,
        amountOut: data.toAmount,
        route: {
          type: 'nordstern',
          note: 'Route info not provided by Nordstern'
        }
      };
    }

    error(`[Nordstern] Quote failed for ${chainId}: ${JSON.stringify(data).slice(0, 120)}`);
    return {
      success: false,
      error: 'Nordstern quote failed'
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 100) : ''})`;
      error(`[Nordstern] Error for ${chainId}:`, message);
      return {
        success: false,
        error: message
      };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    error(`[Nordstern] Error for ${chainId}:`, message);
    return {
      success: false,
      error: message
    };
  }
}

export function getNordsternRateLimiterStatus() {
  return rateLimiter.getStatus();
}
