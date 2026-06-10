import axios from 'axios';
import { error, log, warn } from './logger';
import { QuoteResult } from './types';

const PANORA_API_BASE = 'https://api.panora.exchange';
const PANORA_DEFAULT_API_KEY =
  process.env.PANORA_API_KEY ||
  'a4^KV_EaTf4MW#ZdvgGKX#HUD^3IFEAOV_kzpIE^3BQGA8pDnrkT7JcIy#HNlLGi';

const axiosInstance = axios.create({
  baseURL: PANORA_API_BASE,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    Referer: 'https://app.panora.exchange/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'x-api-key': PANORA_DEFAULT_API_KEY
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Panora has no client-side throttle and the background sweep fired many quotes
// concurrently, blowing the shared API key's quota (HTTP 429). Same slot-
// reservation + global-cooldown limiter used for LiFi/Jumper: each caller claims
// the next slot synchronously before awaiting, and a 429 backs the whole fleet off.
class PanoraRateLimiter {
  private nextSlot = 0;
  private cooldownUntil = 0;
  private readonly minInterval = Number(process.env.PANORA_MIN_INTERVAL_MS) || 500; // ~2 RPS

  async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const slot = Math.max(now, this.nextSlot);
      this.nextSlot = slot + this.minInterval; // reserve synchronously
      const wait = slot - now;
      if (wait > 0) await delay(wait);
      if (Date.now() >= this.cooldownUntil) return;
    }
  }

  penalize(ms: number): void {
    const until = Date.now() + ms;
    if (until > this.cooldownUntil) this.cooldownUntil = until;
    if (until > this.nextSlot) this.nextSlot = until;
  }
}

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.panora.ratelimiter');
const rateLimiter: PanoraRateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new PanoraRateLimiter();
(globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

const MAX_RETRIES = Number(process.env.PANORA_MAX_RETRIES) || 3;

async function postSwapWithRetry(params: Record<string, string>): Promise<{ data: any }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await rateLimiter.waitForSlot();
    try {
      return await axiosInstance.post<any>('/swap', {}, { params });
    } catch (err) {
      lastErr = err;
      if (!axios.isAxiosError(err)) throw err;
      if (err.response?.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(err.response?.headers?.['retry-after']);
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(500 * 2 ** attempt, 8000);
        rateLimiter.penalize(backoff);
        warn(`[Panora] 429 rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function humanAmountToBaseUnits(amount: string, decimals: number): string {
  const normalized = amount.trim().replace(/,/g, '');
  if (!normalized) return '0';

  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = (fractionRaw + '0'.repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0';

  return `${negative ? '-' : ''}${combined}`;
}

export async function getPanoraQuote(
  fromTokenAddress: string,
  toTokenAddress: string,
  amountInHuman: string,
  outputDecimals: number
): Promise<QuoteResult> {
  try {
    const response = await postSwapWithRetry({
      chainId: '1',
      fromTokenAddress,
      toTokenAddress,
      fromTokenAmount: amountInHuman,
      slippagePercentage: '0.5'
    });

    const data = response.data;
    const quote = Array.isArray(data?.quotes) ? data.quotes[0] : undefined;
    const amountOutHuman = quote?.toTokenAmount;
    if (amountOutHuman) {
      log(`[Panora] ✓ Success: ${fromTokenAddress.slice(0, 10)}...→${toTokenAddress.slice(0, 10)}... ${amountOutHuman}`);
      return {
        success: true,
        amountOut: humanAmountToBaseUnits(String(amountOutHuman), outputDecimals),
        amountOutUsd: quote?.toTokenAmountUSD ? String(quote.toTokenAmountUSD) : undefined,
        route: {
          type: 'panora',
          swaps: Array.isArray(quote?.route) ? quote.route : undefined,
          raw: data
        }
      };
    }

    return {
      success: false,
      error: 'Panora returned no quote',
      route: {
        type: 'panora',
        raw: data
      }
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
      error('[Panora] Error:', message);
      return { success: false, error: message };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[Panora] Error:', message);
    return { success: false, error: message };
  }
}
