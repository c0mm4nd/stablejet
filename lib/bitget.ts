import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface BitgetDepthResponse {
  code: string;
  msg: string;
  requestTime: number;
  data: {
    asks: Array<[string, string]>; // [price, size]
    bids: Array<[string, string]>; // [price, size]
    ts: string;
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

class BitgetRateLimiter {
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

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.bitget.ratelimiter');

const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new BitgetRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function getBitgetDepth(limit: number, symbol: string): Promise<{ bids: Array<[string, string]>; asks: Array<[string, string]> }> {
  // Bitget API endpoint: https://api.bitget.com/api/v2/spot/market/orderbook
  const url = `https://api.bitget.com/api/v2/spot/market/orderbook?symbol=${symbol}&type=step0&limit=${limit}`;

  try {
    log(`[Bitget] Fetching depth data for ${symbol} from api.bitget.com...`);

    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<BitgetDepthResponse>(url);
    const data = response.data;

    if (data.code !== '00000') {
      error(`[Bitget] API error: ${data.msg}`);
      throw new Error(`Bitget API error: ${data.msg}`);
    }

    const bids = data.data.bids;
    const asks = data.data.asks;

    if (!Array.isArray(bids) || !Array.isArray(asks) || bids.length === 0 || asks.length === 0) {
      error(`[Bitget] Empty orderbook for ${symbol}`);
      throw new Error(`Bitget returned empty orderbook for ${symbol}`);
    }

    log(`[Bitget] ✓ Success - bids: ${bids.length}, asks: ${asks.length}, best bid: ${bids[0][0]}`);
    return { bids, asks };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data || err.message;
      error(`[Bitget] Axios error: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}, message:`, message);
      throw new Error(`Bitget error: ${err.message}`);
    }
    error('[Bitget] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
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

export async function getBitgetSwapData(amounts: number[], symbol: string): Promise<ChainSwapData[]> {
  try {
    const depth = await getBitgetDepth(150, symbol);

    return amounts.map(amount => {
      const aToBSim = simulateSellBaseForQuote(amount, depth.bids);
      const bToASim = simulateBuyBaseWithQuote(amount, depth.asks);

      const aToBOut = aToBSim.fullyFilled ? aToBSim.quoteOut : null;
      const bToAOut = bToASim.fullyFilled ? bToASim.baseOut : null;

      return {
        chain: 'Bitget',
        chainKey: 'bitget',
        amount,
        dataSource: 'bitget' as any,
        tokenAToB: {
          input: amount,
          output: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          outputUsd: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          ...(aToBSim.fullyFilled ? {} : { error: 'Insufficient Bitget bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          outputUsd: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          ...(bToASim.fullyFilled ? {} : { error: 'Insufficient Bitget ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Bitget error';
    error('[Bitget] Error fetching swap data:', message);

    return amounts.map(amount => ({
      chain: 'Bitget',
      chainKey: 'bitget',
      amount,
      dataSource: 'bitget' as any,
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

export function getBitgetRateLimiterStatus() {
  return rateLimiter.getStatus();
}
