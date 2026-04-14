import axios from 'axios';
import { log, error, warn } from './logger';
import { QuoteResult } from './types';
import { mapLiFiRouteAlternative } from './lifi-route';

const JUMPER_API_BASE = 'https://api.jumper.exchange/pipeline/v1/advanced/routes';
const JUMPER_FROM_ADDRESS = process.env.LIFI_FROM_ADDRESS || '0x0000000000000000000000000000000000000001';
// client-side tool filter (both tool key and toolDetails.name, lowercased substring match)
const DENY_TOOL_NAMES = ['cow'];

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
executionType: 'all'
    }
  };

  try {
    await rateLimiter.waitForSlot();
    const response = await axiosInstance.post<any>(JUMPER_API_BASE, payload);
    const data = response.data;
    const allRoutes = Array.isArray(data?.routes) ? data.routes : [];
    // Client-side filter: remove routes where any step or the route itself uses a denied tool
    function isDeniedTool(toolStr: string): boolean {
      const lower = toolStr.toLowerCase();
      for (const denied of DENY_TOOL_NAMES) {
        if (lower.includes(denied)) return true;
      }
      return false;
    }
    const routes = allRoutes.filter((route: any) => {
      if (isDeniedTool(route?.tool || '') || isDeniedTool(route?.toolDetails?.name || '')) return false;
      const steps: any[] = Array.isArray(route?.steps) ? route.steps : [];
      for (const step of steps) {
        if (isDeniedTool(step?.tool || '') || isDeniedTool(step?.toolDetails?.name || '')) return false;
      }
      return true;
    });
    const alternatives = routes.map((route: any) => mapLiFiRouteAlternative(route));
    const bestRoute = routes[0];
    const amountOut = bestRoute?.toAmount;
    const amountOutUsd = bestRoute?.toAmountUSD;
    const tool = alternatives[0]?.toolNames?.join(' / ')
      || bestRoute?.steps?.[0]?.tool
      || bestRoute?.steps?.[0]?.toolDetails?.name;

    if (amountOut) {
      if (tool && isDeniedTool(tool)) {
        const rawSteps = JSON.stringify(bestRoute?.steps?.map((s: any) => ({ tool: s?.tool, name: s?.toolDetails?.name })));
        error(`[LiFi/Jumper] WARN denied tool still in result for ${chainId}: tool=${tool} rawSteps=${rawSteps}`);
      }
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
