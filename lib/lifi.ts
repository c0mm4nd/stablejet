import axios from 'axios';
import { log, error, warn } from './logger';
import { QuoteResult } from './types';
import { mapLiFiRouteAlternative } from './lifi-route';

const JUMPER_API_BASE = 'https://api.jumper.exchange/pipeline/v1/advanced/routes';
const JUMPER_FROM_ADDRESS = process.env.LIFI_FROM_ADDRESS || '0x0000000000000000000000000000000000000001';
const JUMPER_DENY_EXCHANGES = ['fly', 'cowswap', 'nordstern'];

const axiosInstance = axios.create({
  timeout: 20000,
  headers: {
    Accept: '*/*',
    'Content-Type': 'application/json',
    Origin: 'https://jumper.exchange',
    Referer: 'https://jumper.exchange/',
    'User-Agent': 'stablejet-monitor/1.0',
    'x-lifi-integrator': 'jumper.exchange',
    'x-lifi-sdk': '3.15.1',
    'x-lifi-widget': '3.40.1'
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class LiFiRateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 100; // 10 RPS

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
    error('[LiFi/Jumper] Missing chainId');
    return { success: false, error: 'LiFi/Jumper missing chainId' };
  }

  const payload = {
    fromAddress: JUMPER_FROM_ADDRESS,
    fromAmount: amountDecimals,
    fromChainId: Number(chainId),
    fromTokenAddress: fromToken,
    toChainId: Number(chainId),
    toTokenAddress: toToken,
    options: {
      integrator: 'jumper.exchange',
      order: 'CHEAPEST',
      slippage: 0.0001,
      maxPriceImpact: 0.4,
      jitoBundle: true,
      allowSwitchChain: true,
      exchanges: {
        deny: JUMPER_DENY_EXCHANGES
      },
      executionType: 'all'
    }
  };

  try {
    await rateLimiter.waitForSlot();
    const response = await axiosInstance.post<any>(JUMPER_API_BASE, payload);
    const data = response.data;
    const routes = Array.isArray(data?.routes) ? data.routes : [];
    const alternatives = routes.map((route: any) => mapLiFiRouteAlternative(route));
    const bestRoute = routes[0];
    const amountOut = bestRoute?.toAmount;
    const amountOutUsd = bestRoute?.toAmountUSD;
    const tool = alternatives[0]?.toolNames?.join(' / ')
      || bestRoute?.steps?.[0]?.tool
      || bestRoute?.steps?.[0]?.toolDetails?.name;

    if (amountOut) {
      log(`[LiFi/Jumper] ✓ Success for ${chainId}: ${amountOut} out (${tool || 'unknown tool'})`);
      return {
        success: true,
        amountOut,
        amountOutUsd,
        route: {
          type: 'lifi',
          raw: data,
          selectedTool: tool,
          alternatives,
          note: tool ? `tool: ${tool}` : undefined
        }
      };
    }

    warn(`[LiFi/Jumper] Quote missing amount for ${chainId}`);
    return {
      success: false,
      error: 'LiFi/Jumper quote missing amount',
      route: {
        type: 'lifi',
        raw: data,
        selectedTool: tool,
        alternatives,
        note: tool ? `tool: ${tool}` : undefined
      }
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
      error('[LiFi/Jumper] Error:', message);
      return { success: false, error: message };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[LiFi/Jumper] Error:', message);
    return { success: false, error: message };
  }
}
