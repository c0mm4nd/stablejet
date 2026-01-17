import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface MexcDepthResponse {
  asks: Array<[string, string]>; // [price, qty]
  bids: Array<[string, string]>; // [price, qty]
}

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'stablejet-monitor/1.0',
    'Accept': 'application/json'
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MexcRateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 1000; // 最小1秒间隔

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await delay(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  getStatus(): { rate: string } {
    return {
      rate: '1 req/1s (single request per cycle)'
    };
  }
}

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.mexc.ratelimiter');

const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new MexcRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function getMexcUsdcUsdtDepth(limit: number = 200, symbol: string = 'USDCUSDT'): Promise<MexcDepthResponse> {
  // MEXC API v3: https://api.mexc.com/api/v3/depth?symbol=USDCUSDT&limit=200
  const url = `https://api.mexc.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;

  try {
    log('[MEXC] Fetching depth data from api.mexc.com...');

    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<MexcDepthResponse>(url);
    const data = response.data;

    if (!Array.isArray(data.bids) || !Array.isArray(data.asks) || data.bids.length === 0 || data.asks.length === 0) {
      error('[MEXC] Empty orderbook for USDCUSDT');
      throw new Error('MEXC returned empty orderbook for USDCUSDT');
    }

    log(`[MEXC] ✓ Success - bids: ${data.bids.length}, asks: ${data.asks.length}, best bid: ${data.bids[0][0]}`);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data || err.message;
      error(`[MEXC] Axios error: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}, message:`, message);
      throw new Error(`MEXC error: ${err.message}`);
    }
    error('[MEXC] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
    throw err;
  }
}

function simulateSellBaseForQuote(baseAmount: number, bids: Array<[string, string]>): { quoteOut: number; fullyFilled: boolean } {
  let remainingBase = baseAmount;
  let quoteOut = 0;

  for (const [priceStr, qtyStr] of bids) {
    if (remainingBase <= 0) break;
    const price = Number.parseFloat(priceStr);
    const levelBaseQty = Number.parseFloat(qtyStr);
    if (!Number.isFinite(price) || !Number.isFinite(levelBaseQty) || price <= 0 || levelBaseQty <= 0) continue;

    const filledBase = Math.min(levelBaseQty, remainingBase);
    quoteOut += filledBase * price;
    remainingBase -= filledBase;
  }

  return { quoteOut, fullyFilled: remainingBase <= 1e-12 };
}

function simulateBuyBaseWithQuote(quoteAmount: number, asks: Array<[string, string]>): { baseOut: number; fullyFilled: boolean } {
  let remainingQuote = quoteAmount;
  let baseOut = 0;

  for (const [priceStr, qtyStr] of asks) {
    if (remainingQuote <= 0) break;
    const price = Number.parseFloat(priceStr);
    const levelBaseQty = Number.parseFloat(qtyStr);
    if (!Number.isFinite(price) || !Number.isFinite(levelBaseQty) || price <= 0 || levelBaseQty <= 0) continue;

    const maxBaseAffordable = remainingQuote / price;
    const filledBase = Math.min(levelBaseQty, maxBaseAffordable);
    baseOut += filledBase;
    remainingQuote -= filledBase * price;
  }

  return { baseOut, fullyFilled: remainingQuote <= 1e-8 };
}

export async function getMexcSwapData(amounts: number[], symbol: string = 'USDCUSDT'): Promise<ChainSwapData[]> {
  try {
    const depth = await getMexcUsdcUsdtDepth(200, symbol);

    return amounts.map(amount => {
      const usdcToUsdtSim = simulateSellBaseForQuote(amount, depth.bids);
      const usdtToUsdcSim = simulateBuyBaseWithQuote(amount, depth.asks);

      const usdcToUsdtOut = usdcToUsdtSim.fullyFilled ? usdcToUsdtSim.quoteOut : null;
      const usdtToUsdcOut = usdtToUsdcSim.fullyFilled ? usdtToUsdcSim.baseOut : null;

      return {
        chain: 'MEXC',
        chainKey: 'mexc',
        amount,
        dataSource: 'mexc' as any,
        usdcToUsdt: {
          input: amount,
          output: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          outputUsd: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          ...(usdcToUsdtSim.fullyFilled ? {} : { error: 'Insufficient MEXC bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        usdtToUsdc: {
          input: amount,
          output: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          outputUsd: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          ...(usdtToUsdcSim.fullyFilled ? {} : { error: 'Insufficient MEXC ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenAToB: {
          input: amount,
          output: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          outputUsd: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          ...(usdcToUsdtSim.fullyFilled ? {} : { error: 'Insufficient MEXC bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          outputUsd: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          ...(usdtToUsdcSim.fullyFilled ? {} : { error: 'Insufficient MEXC ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown MEXC error';
    error('[MEXC] Error fetching swap data:', message);

    return amounts.map(amount => ({
      chain: 'MEXC',
      chainKey: 'mexc',
      amount,
      dataSource: 'mexc' as any,
      usdcToUsdt: {
        input: amount,
        output: null,
        outputUsd: null,
        error: message,
        route: { type: 'cex', note: 'Orderbook depth simulation' }
      },
      usdtToUsdc: {
        input: amount,
        output: null,
        outputUsd: null,
        error: message,
        route: { type: 'cex', note: 'Orderbook depth simulation' }
      },
      tokenAToB: {
        input: amount,
        output: null,
        outputUsd: null,
        error: message,
        route: { type: 'cex', note: 'Orderbook depth simulation' }
      },
      tokenBToA: {
        input: amount,
        output: null,
        outputUsd: null,
        error: message,
        route: { type: 'cex', note: 'Orderbook depth simulation' }
      },
    }));
  }
}

export function getMexcRateLimiterStatus() {
  return rateLimiter.getStatus();
}
