import axios from 'axios';
import { log, error } from './logger';
import { ChainSwapData } from './types';

interface BinanceDepthResponse {
  lastUpdateId: number;
  bids: Array<[string, string]>; // [price, qty] where qty is base (USDC)
  asks: Array<[string, string]>; // [price, qty] where qty is base (USDC)
}

// axios 会自动使用环境变量中的代理：HTTP_PROXY, HTTPS_PROXY, NO_PROXY
const axiosInstance = axios.create({
  timeout: 10000, // 10秒超时
  headers: {
    'User-Agent': 'stablejet-monitor/1.0',
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

async function getBinanceUsdcUsdtDepth(limit: number = 1000, symbol: string = 'USDCUSDT'): Promise<BinanceDepthResponse> {
  // 后台任务直接调用 Binance API（服务端）
  // axios 自动使用系统代理环境变量
  const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;

  try {
    log(`[Binance] Fetching depth data for ${symbol} from api.binance.com...`);

    // 等待速率限制器允许
    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<BinanceDepthResponse>(url);
    const data = response.data;

    if (!Array.isArray(data.bids) || !Array.isArray(data.asks) || data.bids.length === 0 || data.asks.length === 0) {
      error('[Binance] Empty orderbook for USDCUSDT');
      throw new Error('Binance returned empty orderbook for USDCUSDT');
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

export async function getBinanceSwapData(amounts: number[], symbol: string = 'USDCUSDT'): Promise<ChainSwapData[]> {
  try {
    // Use depth to approximate market-order execution (assume you eat the book).
    const depth = await getBinanceUsdcUsdtDepth(1000, symbol);

    return amounts.map(amount => {
      const usdcToUsdtSim = simulateSellBaseForQuote(amount, depth.bids);
      const usdtToUsdcSim = simulateBuyBaseWithQuote(amount, depth.asks);

      const usdcToUsdtOut = usdcToUsdtSim.fullyFilled ? usdcToUsdtSim.quoteOut : null;
      const usdtToUsdcOut = usdtToUsdcSim.fullyFilled ? usdtToUsdcSim.baseOut : null;

      return {
        chain: 'Binance',
        chainKey: 'binance',
        amount,
        dataSource: 'binance',
        usdcToUsdt: {
          input: amount,
          output: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          outputUsd: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          ...(usdcToUsdtSim.fullyFilled ? {} : { error: 'Insufficient Binance bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        usdtToUsdc: {
          input: amount,
          output: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          outputUsd: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          ...(usdtToUsdcSim.fullyFilled ? {} : { error: 'Insufficient Binance ask liquidity to fill market buy' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenAToB: {
          input: amount,
          output: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          outputUsd: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          ...(usdcToUsdtSim.fullyFilled ? {} : { error: 'Insufficient Binance bid liquidity to fill market sell' }),
          route: { type: 'cex', note: 'Orderbook depth simulation' }
        },
        tokenBToA: {
          input: amount,
          output: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          outputUsd: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          ...(usdtToUsdcSim.fullyFilled ? {} : { error: 'Insufficient Binance ask liquidity to fill market buy' }),
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

// 导出速率限制器状态
export function getBinanceRateLimiterStatus() {
  return rateLimiter.getStatus();
}
