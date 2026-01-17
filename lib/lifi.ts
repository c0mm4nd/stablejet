import axios from 'axios';
import { log, error, warn } from './logger';
import { QuoteResult } from './types';

const LIFI_API_BASE = 'https://li.quest/v1/quote';
const LIFI_API_KEY = process.env.LIFI_API_KEY || '90cd4879-4b63-4860-ad95-88d7a139e437.5887670a-dd66-40ab-a3a6-7539a5be09aa';
const LIFI_FROM_ADDRESS = process.env.LIFI_FROM_ADDRESS || '0x0000000000000000000000000000000000000001';

const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'stablejet-monitor/1.0',
    'x-lifi-api-key': LIFI_API_KEY
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class LiFiRateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 1000; // 1 RPS

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await delay(this.minInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }
}

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.lifi.ratelimiter');
const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new LiFiRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

export async function getLiFiQuoteByChainId(
  chainId: string,
  fromToken: string,
  toToken: string,
  amountDecimals: string
): Promise<QuoteResult> {
  if (!chainId) {
    error('[LiFi] Missing chainId');
    return { success: false, error: 'LiFi missing chainId' };
  }

  const params = {
    fromChain: chainId,
    toChain: chainId,
    fromToken,
    toToken,
    fromAmount: amountDecimals,
    fromAddress: LIFI_FROM_ADDRESS,
    toAddress: LIFI_FROM_ADDRESS
  };

  try {
    await rateLimiter.waitForSlot();
    const response = await axiosInstance.get<any>(LIFI_API_BASE, { params });
    const data = response.data;
    const amountOut = data?.estimate?.toAmount;
    const amountOutUsd = data?.estimate?.toAmountUSD;

    if (amountOut) {
      log(`[LiFi] ✓ Success for ${chainId}: ${amountOut} out (${data?.tool || 'unknown tool'})`);
      return {
        success: true,
        amountOut,
        amountOutUsd,
        route: {
          type: 'lifi',
          raw: data,
          note: data?.tool ? `tool: ${data.tool}` : undefined
        }
      };
    }

    warn(`[LiFi] Quote missing amount for ${chainId}`);
    return {
      success: false,
      error: 'LiFi quote missing amount',
      route: {
        type: 'lifi',
        raw: data,
        note: data?.tool ? `tool: ${data.tool}` : undefined
      }
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
      error('[LiFi] Error:', message);
      return { success: false, error: message };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[LiFi] Error:', message);
    return { success: false, error: message };
  }
}
