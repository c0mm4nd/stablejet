import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface KrakenDepthResponse {
  error: string[];
  result: {
    [pair: string]: {
      asks: Array<[string, string, number]>; // [price, volume, timestamp]
      bids: Array<[string, string, number]>; // [price, volume, timestamp]
    };
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

class KrakenRateLimiter {
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

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.kraken.ratelimiter');

const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new KrakenRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function getKrakenDepth(count: number, pair: string): Promise<{ bids: Array<[string, string]>; asks: Array<[string, string]> }> {
  // Kraken API endpoint: https://api.kraken.com/0/public/Depth
  const url = `https://api.kraken.com/0/public/Depth?pair=${pair}&count=${count}`;

  try {
    log(`[Kraken] Fetching depth data for ${pair} from api.kraken.com...`);

    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<KrakenDepthResponse>(url);
    const data = response.data;

    if (data.error && data.error.length > 0) {
      error(`[Kraken] API error: ${data.error.join(', ')}`);
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    // Kraken returns result with pair name as key, which might be different from input
    const pairKey = Object.keys(data.result)[0];
    if (!pairKey) {
      error(`[Kraken] No data returned for ${pair}`);
      throw new Error(`Kraken returned no data for ${pair}`);
    }

    const orderbook = data.result[pairKey];

    // Convert from [price, volume, timestamp] to [price, volume]
    const bids = orderbook.bids.map(([price, volume]) => [price, volume] as [string, string]);
    const asks = orderbook.asks.map(([price, volume]) => [price, volume] as [string, string]);

    if (!Array.isArray(bids) || !Array.isArray(asks) || bids.length === 0 || asks.length === 0) {
      error(`[Kraken] Empty orderbook for ${pair}`);
      throw new Error(`Kraken returned empty orderbook for ${pair}`);
    }

    log(`[Kraken] ✓ Success - bids: ${bids.length}, asks: ${asks.length}, best bid: ${bids[0][0]}`);
    return { bids, asks };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data || err.message;
      error(`[Kraken] Axios error: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}, message:`, message);
      throw new Error(`Kraken error: ${err.message}`);
    }
    error('[Kraken] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
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

export async function getKrakenSwapData(amounts: number[], pair: string): Promise<ChainSwapData[]> {
  try {
    const depth = await getKrakenDepth(100, pair);

    return amounts.map(amount => {
      const aToBSim = simulateSellBaseForQuote(amount, depth.bids);
      const bToASim = simulateBuyBaseWithQuote(amount, depth.asks);

      const aToBOut = aToBSim.fullyFilled ? aToBSim.quoteOut : null;
      const bToAOut = bToASim.fullyFilled ? bToASim.baseOut : null;

      return {
        chain: 'Kraken',
        chainKey: 'kraken',
        amount,
        dataSource: 'kraken' as any,
        tokenAToB: {
          input: amount,
          output: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          outputUsd: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          ...(aToBSim.fullyFilled ? {} : { error: 'Insufficient Kraken bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          outputUsd: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          ...(bToASim.fullyFilled ? {} : { error: 'Insufficient Kraken ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Kraken error';
    error('[Kraken] Error fetching swap data:', message);

    return amounts.map(amount => ({
      chain: 'Kraken',
      chainKey: 'kraken',
      amount,
      dataSource: 'kraken' as any,
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

export function getKrakenRateLimiterStatus() {
  return rateLimiter.getStatus();
}
