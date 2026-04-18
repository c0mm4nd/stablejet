import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface OkxBooksResponse {
  code: string;
  msg: string;
  data: Array<{
    asks: Array<[string, string, string, string]>; // [price, qty, deprecated, numOrders]
    bids: Array<[string, string, string, string]>;
    ts: string;
  }>;
}

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'stablejet-monitor/1.0',
    'Accept': 'application/json'
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class OkxRateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 1000;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await delay(this.minInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  getStatus(): { rate: string } {
    return { rate: '1 req/1s (single request per cycle)' };
  }
}

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.okx.ratelimiter');
const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new OkxRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function getOkxDepth(instId: string, sz = 400): Promise<{ bids: Array<[string, string]>; asks: Array<[string, string]> }> {
  const url = `https://www.okx.com/api/v5/market/books?instId=${instId}&sz=${sz}`;

  try {
    log(`[OKX] Fetching depth data for ${instId} from okx.com...`);
    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<OkxBooksResponse>(url);
    const data = response.data;

    if (data.code !== '0' || !data.data?.length) {
      throw new Error(`OKX API error: code=${data.code} msg=${data.msg}`);
    }

    const book = data.data[0];
    const bids: Array<[string, string]> = book.bids.map(b => [b[0], b[1]]);
    const asks: Array<[string, string]> = book.asks.map(a => [a[0], a[1]]);

    if (!bids.length || !asks.length) {
      throw new Error(`OKX returned empty orderbook for ${instId}`);
    }

    log(`[OKX] ✓ Success - bids: ${bids.length}, asks: ${asks.length}, best bid: ${bids[0][0]}`);
    return { bids, asks };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data || err.message;
      error(`[OKX] Axios error: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}, message:`, message);
      throw new Error(`OKX error: ${err.message}`);
    }
    error('[OKX] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
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

export async function getOkxSwapData(amounts: number[], instId: string): Promise<ChainSwapData[]> {
  try {
    const depth = await getOkxDepth(instId);

    return amounts.map(amount => {
      const aToBSim = simulateSellBaseForQuote(amount, depth.bids);
      const bToASim = simulateBuyBaseWithQuote(amount, depth.asks);
      const aToBOut = aToBSim.fullyFilled ? aToBSim.quoteOut : null;
      const bToAOut = bToASim.fullyFilled ? bToASim.baseOut : null;

      return {
        chain: 'OKX',
        chainKey: 'okx',
        amount,
        dataSource: 'okx',
        tokenAToB: {
          input: amount,
          output: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          outputUsd: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          ...(aToBSim.fullyFilled ? {} : { error: 'Insufficient OKX bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          outputUsd: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          ...(bToASim.fullyFilled ? {} : { error: 'Insufficient OKX ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown OKX error';
    error('[OKX] Error fetching swap data:', message);
    return amounts.map(amount => ({
      chain: 'OKX',
      chainKey: 'okx',
      amount,
      dataSource: 'okx',
      tokenAToB: { input: amount, output: null, outputUsd: null, error: message, route: { type: 'cex', note: 'Orderbook depth simulation' } },
      tokenBToA: { input: amount, output: null, outputUsd: null, error: message, route: { type: 'cex', note: 'Orderbook depth simulation' } },
    }));
  }
}

export function getOkxRateLimiterStatus() {
  return rateLimiter.getStatus();
}
