import axios from 'axios';
import { QuoteResult, KyberSwapQuoteResponse, ChainSwapData } from './types';
import { USDT_USDC_CHAINS, AMOUNTS, toWei, fromWei, getAllUnstableTokens, OPENOCEAN_ONLY_CHAINS } from './config';
import { getOpenOceanQuoteByChainKey } from './openocean';
import { getBinanceSwapData } from './binance';
import { getMexcSwapData } from './mexc';
import { getBybitSwapData } from './bybit';

// axios 会自动使用环境变量中的代理：HTTP_PROXY, HTTPS_PROXY, NO_PROXY
const axiosInstance = axios.create({
  timeout: 15000, // 15秒超时
  headers: {
    'x-client-id': 'stablejet-monitor',
    'Accept': 'application/json',
    'User-Agent': 'stablejet-monitor/1.0'
  }
});

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// KyberSwap 速率限制器 - 10 RPS (100 requests / 10 seconds)
class KyberSwapRateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequests = 100; // 10秒内最多100个请求
  private readonly windowMs = 10000; // 10秒窗口
  private readonly minInterval = 100; // 最小间隔100ms (10 RPS)

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // 清理超过时间窗口的请求记录
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    
    // 如果达到限制，等待直到有空位
    while (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100;
      await delay(waitTime);
      
      const newNow = Date.now();
      this.requestTimes = this.requestTimes.filter(time => newNow - time < this.windowMs);
    }
    
    // 确保最小间隔
    if (this.requestTimes.length > 0) {
      const lastRequest = this.requestTimes[this.requestTimes.length - 1];
      const timeSinceLastRequest = now - lastRequest;
      if (timeSinceLastRequest < this.minInterval) {
        const waitTime = this.minInterval - timeSinceLastRequest;
        await delay(waitTime);
      }
    }
    
    // 记录这次请求
    this.requestTimes.push(Date.now());
  }
  
  getStatus(): { current: number; max: number; rate: string } {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    return {
      current: this.requestTimes.length,
      max: this.maxRequests,
      rate: '10 RPS (100 req/10s)'
    };
  }
}

const rateLimiter = new KyberSwapRateLimiter();

// 检查路由路径是否包含不稳定代币
function hasUnstableTokenInRoute(route: Array<Array<{
  pool: string;
  tokenIn: string;
  tokenOut: string;
  swapAmount: string;
}>>): boolean {
  const unstableTokens = getAllUnstableTokens();

  for (const path of route) {
    for (const hop of path) {
      // 检查路径中的每个代币是否在不稳定代币列表中
      if (unstableTokens.has(hop.tokenIn.toLowerCase()) ||
          unstableTokens.has(hop.tokenOut.toLowerCase())) {
        
        return true;
      }
    }
  }

  return false;
}

// 调用 KyberSwap API 获取报价
export async function getQuote(
  chain: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<QuoteResult> {
  // if having _, get the first part
  const chainClean = chain.split('_')[0];

  const url = `https://aggregator-api.kyberswap.com/${chainClean}/api/v1/routes`;
  const params = new URLSearchParams({
    tokenIn,
    tokenOut,
    amountIn,
    gasInclude: 'true'
  });

  try {
    // 等待速率限制器允许
    await rateLimiter.waitForSlot();
    
    const response = await axiosInstance.get<KyberSwapQuoteResponse>(`${url}?${params}`);
    const data = response.data;

    if (data.code === 0 && data.data?.routeSummary) {
      // 检查路由路径是否包含不稳定代币
      // if (data.data.routeSummary.route && hasUnstableTokenInRoute(data.data.routeSummary.route)) {
      //   return {
      //     success: false,
      //     error: 'Route contains unstable tokens (ETH/WETH/WBTC)'
      //   };
      // }

      return {
        success: true,
        amountOut: data.data.routeSummary.amountOut,
        amountOutUsd: data.data.routeSummary.amountOutUsd
      };
    } else {
      console.error(`[KyberSwap] No route found for ${chainClean}: ${data.message || 'Unknown'}`);
      return {
        success: false,
        error: data.message || 'No route found'
      };
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusText = error.response?.statusText || '';
      const message = `${error.message} (status: ${error.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''})`;
      console.error(`[KyberSwap] Error for ${chainClean}:`, message);
      return {
        success: false,
        error: message
      };
    }
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[KyberSwap] Error for ${chainClean}:`, message);
    return {
      success: false,
      error: message
    };
  }
}

// 导出速率限制器状态
export function getKyberSwapRateLimiterStatus() {
  return rateLimiter.getStatus();
}

// 获取所有链的兑换数据
export async function getAllSwapData(): Promise<ChainSwapData[]> {
  const results: ChainSwapData[] = [];
  
  // 并发启动所有 CEX 数据获取
  const binanceDataPromise = getBinanceSwapData(AMOUNTS);
  const mexcDataPromise = getMexcSwapData(AMOUNTS);
  const bybitDataPromise = getBybitSwapData(AMOUNTS);

  for (const [chainKey, chainConfig] of Object.entries(USDT_USDC_CHAINS)) {
    // 跳过 CEX，它们单独处理
    if (chainKey === 'binance' || chainKey === 'mexc' || chainKey === 'bybit') {
      continue;
    }

    for (const amount of AMOUNTS) {
      const amountInWei = toWei(amount);

      const chainCleanKey = chainKey.split('_')[0];
      const useOpenOcean = OPENOCEAN_ONLY_CHAINS.has(chainKey) || OPENOCEAN_ONLY_CHAINS.has(chainCleanKey);

      // USDC -> USDT
      const usdcToUsdt = useOpenOcean
        ? await getOpenOceanQuoteByChainKey(chainKey, chainConfig.usdc, chainConfig.usdt, amountInWei)
        : await getQuote(chainKey, chainConfig.usdc, chainConfig.usdt, amountInWei);

      // USDT -> USDC
      const usdtToUsdc = useOpenOcean
        ? await getOpenOceanQuoteByChainKey(chainKey, chainConfig.usdt, chainConfig.usdc, amountInWei)
        : await getQuote(chainKey, chainConfig.usdt, chainConfig.usdc, amountInWei);

      const dataSource: 'kyberswap' | 'openocean' = useOpenOcean ? 'openocean' : 'kyberswap';

      results.push({
        chain: chainConfig.name,
        chainKey,
        amount,
        dataSource,
        usdcToUsdt: {
          input: amount,
          output: usdcToUsdt.success && usdcToUsdt.amountOut ? fromWei(usdcToUsdt.amountOut) : null,
          outputUsd: usdcToUsdt.success && usdcToUsdt.amountOutUsd ? parseFloat(usdcToUsdt.amountOutUsd) : null,
          error: usdcToUsdt.error
        },
        usdtToUsdc: {
          input: amount,
          output: usdtToUsdc.success && usdtToUsdc.amountOut ? fromWei(usdtToUsdc.amountOut) : null,
          outputUsd: usdtToUsdc.success && usdtToUsdc.amountOutUsd ? parseFloat(usdtToUsdc.amountOutUsd) : null,
          error: usdtToUsdc.error
        }
      });
    }
  }

  // 等待所有 CEX 数据
  try {
    const [binanceData, mexcData, bybitData] = await Promise.all([
      binanceDataPromise,
      mexcDataPromise,
      bybitDataPromise
    ]);
    results.push(...binanceData, ...mexcData, ...bybitData);
  } catch (error) {
    console.error('[CEX] Error fetching CEX data:', error);
    // CEX 数据失败不影响整体
  }

  return results;
}
