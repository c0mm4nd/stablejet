import axios from 'axios';
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

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'stablejet-monitor/1.0',
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

const rateLimiter = new BybitRateLimiter();

async function getBybitUsdcUsdtDepth(limit: number = 500): Promise<{ bids: Array<[string, string]>; asks: Array<[string, string]> }> {
  // Bybit API v5: https://api.bybit.com/v5/market/orderbook?category=spot&symbol=USDCUSDT&limit=500
  const url = `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=USDCUSDT&limit=${limit}`;

  try {
    console.log('[Bybit] Fetching depth data from api.bybit.com...');
    
    await rateLimiter.waitForSlot();
    
    const response = await axiosInstance.get<BybitDepthResponse>(url);
    const data = response.data;
    
    if (data.retCode !== 0) {
      console.error(`[Bybit] API error: ${data.retMsg}`);
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }

    const bids = data.result.b;
    const asks = data.result.a;
    
    if (!Array.isArray(bids) || !Array.isArray(asks) || bids.length === 0 || asks.length === 0) {
      console.error('[Bybit] Empty orderbook for USDCUSDT');
      throw new Error('Bybit returned empty orderbook for USDCUSDT');
    }

    console.log(`[Bybit] ✓ Success - bids: ${bids.length}, asks: ${asks.length}, best bid: ${bids[0][0]}`);
    return { bids, asks };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data || error.message;
      console.error(`[Bybit] Axios error: ${error.code || 'UNKNOWN'}, status: ${error.response?.status || 'N/A'}, message:`, message);
      throw new Error(`Bybit error: ${error.message}`);
    }
    console.error('[Bybit] Unexpected error:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
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

export async function getBybitSwapData(amounts: number[]): Promise<ChainSwapData[]> {
  try {
    const depth = await getBybitUsdcUsdtDepth(500);

    return amounts.map(amount => {
      const usdcToUsdtSim = simulateSellBaseForQuote(amount, depth.bids);
      const usdtToUsdcSim = simulateBuyBaseWithQuote(amount, depth.asks);

      const usdcToUsdtOut = usdcToUsdtSim.fullyFilled ? usdcToUsdtSim.quoteOut : null;
      const usdtToUsdcOut = usdtToUsdcSim.fullyFilled ? usdtToUsdcSim.baseOut : null;

      return {
        chain: 'Bybit',
        chainKey: 'bybit',
        amount,
        dataSource: 'bybit' as any,
        usdcToUsdt: {
          input: amount,
          output: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          outputUsd: usdcToUsdtOut !== null && Number.isFinite(usdcToUsdtOut) ? usdcToUsdtOut : null,
          ...(usdcToUsdtSim.fullyFilled ? {} : { error: 'Insufficient Bybit bid liquidity to fill market sell' }),
        },
        usdtToUsdc: {
          input: amount,
          output: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          outputUsd: usdtToUsdcOut !== null && Number.isFinite(usdtToUsdcOut) ? usdtToUsdcOut : null,
          ...(usdtToUsdcSim.fullyFilled ? {} : { error: 'Insufficient Bybit ask liquidity to fill market buy' }),
        },
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Bybit error';
    console.error('[Bybit] Error fetching swap data:', message);

    return amounts.map(amount => ({
      chain: 'Bybit',
      chainKey: 'bybit',
      amount,
      dataSource: 'bybit' as any,
      usdcToUsdt: {
        input: amount,
        output: null,
        outputUsd: null,
        error: message,
      },
      usdtToUsdc: {
        input: amount,
        output: null,
        outputUsd: null,
        error: message,
      },
    }));
  }
}

export function getBybitRateLimiterStatus() {
  return rateLimiter.getStatus();
}
