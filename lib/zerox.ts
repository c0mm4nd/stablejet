import axios from 'axios';
import { error } from './logger';
import { QuoteResult } from './types';

// 模拟真实 Chrome 浏览器请求，绕过 Cloudflare Bot Management
const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://matcha.xyz',
    'Referer': 'https://matcha.xyz/',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Connection': 'keep-alive',
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 保守限速：避免触发 Cloudflare 频率检测
class ZeroXRateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 500; // 2 RPS

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await delay(this.minInterval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }
}

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.zerox.ratelimiter');
const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new ZeroXRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

export async function getZeroXQuote(
  chainId: string,
  sellToken: string,
  buyToken: string,
  sellAmount: string
): Promise<QuoteResult> {
  const url = 'https://matcha.xyz/api/gasless/price';
  const params = {
    chainId,
    sellToken,
    buyToken,
    sellAmount,
    slippageBps: '50',
  };

  try {
    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get(url, { params });
    const data = response.data;

    if (data.buyAmount && data.liquidityAvailable !== false) {
      const fills: Array<{ source: string; proportionBps: string }> = data.route?.fills || [];
      const usedFills = fills.filter(f => parseInt(f.proportionBps) > 0);

      return {
        success: true,
        amountOut: data.buyAmount,
        route: {
          type: 'zerox',
          raw: data,
          paths: usedFills.length > 0
            ? [usedFills.map(f => ({
                tokenIn: sellToken,
                tokenOut: buyToken,
                exchange: f.source,
              }))]
            : undefined
        }
      };
    }

    const msg = data.liquidityAvailable === false ? 'No liquidity available' : 'No route found';
    error(`[0x/Matcha] ${msg} for chainId=${chainId}`);
    return { success: false, error: msg };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorBody = err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : '';
      const msg = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorBody ? ', ' + errorBody : ''})`;
      error(`[0x/Matcha] Error for chainId=${chainId}:`, msg);
      return { success: false, error: msg };
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    error(`[0x/Matcha] Error for chainId=${chainId}:`, msg);
    return { success: false, error: msg };
  }
}
