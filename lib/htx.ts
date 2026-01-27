import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface HtxDepthResponse {
  status: string;
  ch: string;
  ts: number;
  tick: {
    asks: Array<[number, number]>; // [price, amount]
    bids: Array<[number, number]>; // [price, amount]
    ts: number;
    version: number;
  };
}

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'stablejet-monitor/1.0',
    'Accept': 'application/json'
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class HtxRateLimiter {
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

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.htx.ratelimiter');

const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new HtxRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function getHtxDepth(symbol: string, type: string = 'step0'): Promise<{ bids: Array<[string, string]>; asks: Array<[string, string]> }> {
  // HTX (Huobi) API endpoint: https://api.huobi.pro/market/depth
  const url = `https://api.huobi.pro/market/depth?symbol=${symbol}&type=${type}`;

  try {
    log(`[HTX] Fetching depth data for ${symbol} from api.huobi.pro...`);

    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<HtxDepthResponse>(url);
    const data = response.data;

    if (data.status !== 'ok' || !data.tick) {
      error(`[HTX] API error: ${data.status}`);
      throw new Error(`HTX API error: ${data.status}`);
    }

    const bids = data.tick.bids.map(([price, qty]) => [price.toString(), qty.toString()] as [string, string]);
    const asks = data.tick.asks.map(([price, qty]) => [price.toString(), qty.toString()] as [string, string]);

    if (!Array.isArray(bids) || !Array.isArray(asks) || bids.length === 0 || asks.length === 0) {
      error(`[HTX] Empty orderbook for ${symbol}`);
      throw new Error(`HTX returned empty orderbook for ${symbol}`);
    }

    log(`[HTX] ✓ Success - bids: ${bids.length}, asks: ${asks.length}, best bid: ${bids[0][0]}`);
    return { bids, asks };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data || err.message;
      error(`[HTX] Axios error: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}, message:`, message);
      throw new Error(`HTX error: ${err.message}`);
    }
    error('[HTX] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
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

export async function getHtxSwapData(amounts: number[], symbol: string): Promise<ChainSwapData[]> {
  try {
    const depth = await getHtxDepth(symbol);

    return amounts.map(amount => {
      const aToBSim = simulateSellBaseForQuote(amount, depth.bids);
      const bToASim = simulateBuyBaseWithQuote(amount, depth.asks);

      const aToBOut = aToBSim.fullyFilled ? aToBSim.quoteOut : null;
      const bToAOut = bToASim.fullyFilled ? bToASim.baseOut : null;

      return {
        chain: 'HTX',
        chainKey: 'htx',
        amount,
        dataSource: 'htx' as any,
        tokenAToB: {
          input: amount,
          output: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          outputUsd: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          ...(aToBSim.fullyFilled ? {} : { error: 'Insufficient HTX bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          outputUsd: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          ...(bToASim.fullyFilled ? {} : { error: 'Insufficient HTX ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown HTX error';
    error('[HTX] Error fetching swap data:', message);

    return amounts.map(amount => ({
      chain: 'HTX',
      chainKey: 'htx',
      amount,
      dataSource: 'htx' as any,
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

export function getHtxRateLimiterStatus() {
  return rateLimiter.getStatus();
}
