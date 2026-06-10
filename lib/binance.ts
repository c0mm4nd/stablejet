import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface BinanceDepthResponse {
  lastUpdateId: number;
  bids: Array<[string, string]>; // [price, qty] where qty is base (USDC)
  asks: Array<[string, string]>; // [price, qty] where qty is base (USDC)
}

// api.binance.com geo-blocks restricted regions (e.g. US) with HTTP 451. The
// data-api.binance.vision host serves the same public market-data endpoints
// (/api/v3/depth) without geo-restriction and needs no API key. Override with
// BINANCE_API_BASE (e.g. to point at a proxy).
const BINANCE_API_BASE = process.env.BINANCE_API_BASE || 'https://data-api.binance.vision';

// axios 会自动使用环境变量中的代理：HTTP_PROXY, HTTPS_PROXY, NO_PROXY
const axiosInstance = axios.create({
  timeout: 10000, // 10秒超时
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  }
});

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Binance 速率限制器 - 1 request per fetch cycle (no concurrent requests)
class BinanceRateLimiter {
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

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.binance.ratelimiter');

const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new BinanceRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

async function getBinanceDepth(limit: number, symbol: string): Promise<BinanceDepthResponse> {
  const url = `${BINANCE_API_BASE}/api/v3/depth?symbol=${symbol}&limit=${limit}`;

  try {
    log(`[Binance] Fetching depth data for ${symbol} from ${BINANCE_API_BASE}...`);

    // 等待速率限制器允许
    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<BinanceDepthResponse>(url);
    const data = response.data;

    if (!Array.isArray(data.bids) || !Array.isArray(data.asks) || data.bids.length === 0 || data.asks.length === 0) {
      error(`[Binance] Empty orderbook for ${symbol}`);
      throw new Error(`Binance returned empty orderbook for ${symbol}`);
    }

    log(`[Binance] ✓ Success - bids: ${data.bids.length}, asks: ${data.asks.length}, best bid: ${data.bids[0][0]}`);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data || err.message;
      error(`[Binance] Axios error: ${err.code || 'UNKNOWN'}, status: ${err.response?.status || 'N/A'}, message:`, message);
      throw new Error(`Binance error: ${err.message}`);
    }
    error('[Binance] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
    throw err;
  }
}

function simulateSellBaseForQuote(baseAmount: number, bids: Array<[string, string]>): { quoteOut: number; fullyFilled: boolean } {
  // Selling USDC (base) into bids, receiving USDT (quote)
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
  // Buying USDC (base) from asks, spending USDT (quote)
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

export async function getBinanceSwapData(amounts: number[], symbol: string): Promise<ChainSwapData[]> {
  try {
    // Use depth to approximate market-order execution (assume you eat the book).
    const depth = await getBinanceDepth(1000, symbol);

    return amounts.map(amount => {
      const aToBSim = simulateSellBaseForQuote(amount, depth.bids);
      const bToASim = simulateBuyBaseWithQuote(amount, depth.asks);

      const aToBOut = aToBSim.fullyFilled ? aToBSim.quoteOut : null;
      const bToAOut = bToASim.fullyFilled ? bToASim.baseOut : null;

      return {
        chain: 'Binance',
        chainKey: 'binance',
        amount,
        dataSource: 'binance',
        tokenAToB: {
          input: amount,
          output: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          outputUsd: aToBOut !== null && Number.isFinite(aToBOut) ? aToBOut : null,
          ...(aToBSim.fullyFilled ? {} : { error: 'Insufficient Binance bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          outputUsd: bToAOut !== null && Number.isFinite(bToAOut) ? bToAOut : null,
          ...(bToASim.fullyFilled ? {} : { error: 'Insufficient Binance ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Binance error';
    error('[Binance] Error fetching swap data:', message);

    return amounts.map(amount => ({
      chain: 'Binance',
      chainKey: 'binance',
      amount,
      dataSource: 'binance',
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

// 导出速率限制器状态
export function getBinanceRateLimiterStatus() {
  return rateLimiter.getStatus();
}
