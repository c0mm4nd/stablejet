import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface BybitDepthResponse {
  retCode: number;
  retMsg: string;
  result: {
    s: string; // symbol
    b: Array<[string, string]>; // bids [price, qty]
    a: Array<[string, string]>; // asks [price, qty]
    ts: number; // timestamp
    u: number; // update id
  };
}

// api.bybit.com geo-blocks restricted regions (e.g. US) with HTTP 403 at the
// CDN edge. api.bytick.com is Bybit's official mirror with the identical v5 API.
// Override with BYBIT_API_BASE (e.g. to point at a proxy).
const BYBIT_API_BASE = process.env.BYBIT_API_BASE || 'https://api.bytick.com';

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class BybitRateLimiter {
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

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.bybit.ratelimiter');

const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new BybitRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function getBybitDepth(limit: number, symbol: string): Promise<{ bids: Array<[string, string]>; asks: Array<[string, string]> }> {
  const url = `${BYBIT_API_BASE}/v5/market/orderbook?category=spot&symbol=${symbol}&limit=${limit}`;

  try {
    log(`[Bybit] Fetching depth data from ${BYBIT_API_BASE}...`);

    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<BybitDepthResponse>(url);
    const data = response.data;

    if (data.retCode !== 0) {
      error(`[Bybit] API error: ${data.retMsg}`);
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }

    const bids = data.result.b;
    const asks = data.result.a;

    if (!Array.isArray(bids) || !Array.isArray(asks) || bids.length === 0 || asks.length === 0) {
      error(`[Bybit] Empty orderbook for ${symbol}`);
      throw new Error(`Bybit returned empty orderbook for ${symbol}`);
    }

    log(`[Bybit] ✓ Success - bids: ${bids.length}, asks: ${asks.length}, best bid: ${bids[0][0]}`);
    return { bids, asks };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data || err.message;
      error(`[Bybit] Axios error: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}, message:`, message);
      throw new Error(`Bybit error: ${err.message}`);
    }
    error('[Bybit] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
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

export async function getBybitSwapData(amounts: number[], symbol: string): Promise<ChainSwapData[]> {
  try {
    const depth = await getBybitDepth(500, symbol);

    return amounts.map(amount => {
      const aToBSim = simulateSellBaseForQuote(amount, depth.bids);
      const bToASim = simulateBuyBaseWithQuote(amount, depth.asks);

      const aToBOut = aToBSim.fullyFilled ? aToBSim.quoteOut : null;
      const bToAOut = bToASim.fullyFilled ? bToASim.baseOut : null;

      return {
        chain: 'Bybit',
        chainKey: 'bybit',
        amount,
        dataSource: 'bybit' as any,
        tokenAToB: {
          input: amount,
          output: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          outputUsd: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          ...(aToBSim.fullyFilled ? {} : { error: 'Insufficient Bybit bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          outputUsd: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          ...(bToASim.fullyFilled ? {} : { error: 'Insufficient Bybit ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Bybit error';
    error('[Bybit] Error fetching swap data:', message);

    return amounts.map(amount => ({
      chain: 'Bybit',
      chainKey: 'bybit',
      amount,
      dataSource: 'bybit' as any,
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

export function getBybitRateLimiterStatus() {
  return rateLimiter.getStatus();
}
