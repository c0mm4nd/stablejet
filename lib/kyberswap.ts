import axios from 'axios';
import { QuoteResult, KyberSwapQuoteResponse, ChainSwapData, TradingPair } from './types';
import { USDT_USDC_CHAINS, AMOUNTS, toWei, fromWei, getAllUnstableTokens, OPENOCEAN_ONLY_CHAINS, TRADING_PAIRS } from './config';
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
  // 默认获取 USDC/USDT
  return getSwapDataForPair('usdc_usdt');
}

// 获取指定交易对的兑换数据
export async function getSwapDataForPair(pairId: string = 'usdc_usdt'): Promise<ChainSwapData[]> {
  const results: ChainSwapData[] = [];
  
  // 获取交易对配置
  const pair = TRADING_PAIRS[pairId];
  if (!pair) {
    console.error(`[SwapData] Unknown trading pair: ${pairId}`);
    return results;
  }

  console.log(`[SwapData] Fetching data for pair: ${pair.name} (${pairId})`);
  
  // 只有 USDC/USDT 支持 CEX
  const isCexSupported = pairId === 'usdc_usdt';
  
  // 并发启动所有 CEX 数据获取（仅 USDC/USDT）
  const cexPromises = isCexSupported ? [
    getBinanceSwapData(AMOUNTS),
    getMexcSwapData(AMOUNTS),
    getBybitSwapData(AMOUNTS)
  ] : [];

  for (const [chainKey, chainConfig] of Object.entries(USDT_USDC_CHAINS)) {
    // 跳过 CEX，它们单独处理
    if (chainKey === 'binance' || chainKey === 'mexc' || chainKey === 'bybit') {
      continue;
    }

    // 获取该链上的代币地址
    const tokenAAddress = pair.getAddressA(chainConfig);
    const tokenBAddress = pair.getAddressB(chainConfig);

    // 如果该链不支持这个交易对，跳过
    if (!tokenAAddress || !tokenBAddress) {
      console.log(`[SwapData] Skipping ${chainKey} - ${pair.name} not available`);
      continue;
    }

    for (const amount of AMOUNTS) {
      const amountInWei = toWei(amount);

      const chainCleanKey = chainKey.split('_')[0];
      const useOpenOcean = OPENOCEAN_ONLY_CHAINS.has(chainKey) || OPENOCEAN_ONLY_CHAINS.has(chainCleanKey);

      // TokenA -> TokenB
      const tokenAToB = useOpenOcean
        ? await getOpenOceanQuoteByChainKey(chainKey, tokenAAddress, tokenBAddress, amountInWei)
        : await getQuote(chainKey, tokenAAddress, tokenBAddress, amountInWei);

      // TokenB -> TokenA
      const tokenBToA = useOpenOcean
        ? await getOpenOceanQuoteByChainKey(chainKey, tokenBAddress, tokenAAddress, amountInWei)
        : await getQuote(chainKey, tokenBAddress, tokenAAddress, amountInWei);

      const dataSource: 'kyberswap' | 'openocean' = useOpenOcean ? 'openocean' : 'kyberswap';

      // 为了向后兼容，USDC/USDT 数据放在 usdcToUsdt/usdtToUsdc 字段
      // 其他交易对放在 tokenAToB/tokenBToA 字段
      const isUsdcUsdt = pairId === 'usdc_usdt';

      results.push({
        chain: chainConfig.name,
        chainKey,
        amount,
        pairId,
        dataSource,
        // 向后兼容字段（USDC/USDT）
        usdcToUsdt: isUsdcUsdt ? {
          input: amount,
          output: tokenAToB.success && tokenAToB.amountOut ? fromWei(tokenAToB.amountOut) : null,
          outputUsd: tokenAToB.success && tokenAToB.amountOutUsd ? parseFloat(tokenAToB.amountOutUsd) : null,
          error: tokenAToB.error
        } : { input: amount, output: null, outputUsd: null },
        usdtToUsdc: isUsdcUsdt ? {
          input: amount,
          output: tokenBToA.success && tokenBToA.amountOut ? fromWei(tokenBToA.amountOut) : null,
          outputUsd: tokenBToA.success && tokenBToA.amountOutUsd ? parseFloat(tokenBToA.amountOutUsd) : null,
          error: tokenBToA.error
        } : { input: amount, output: null, outputUsd: null },
        // 通用字段（所有交易对）
        tokenAToB: {
          input: amount,
          output: tokenAToB.success && tokenAToB.amountOut ? fromWei(tokenAToB.amountOut) : null,
          outputUsd: tokenAToB.success && tokenAToB.amountOutUsd ? parseFloat(tokenAToB.amountOutUsd) : null,
          error: tokenAToB.error
        },
        tokenBToA: {
          input: amount,
          output: tokenBToA.success && tokenBToA.amountOut ? fromWei(tokenBToA.amountOut) : null,
          outputUsd: tokenBToA.success && tokenBToA.amountOutUsd ? parseFloat(tokenBToA.amountOutUsd) : null,
          error: tokenBToA.error
        }
      });
    }
  }

  // 等待所有 CEX 数据（仅 USDC/USDT）
  if (isCexSupported && cexPromises.length > 0) {
    try {
      const cexResults = await Promise.all(cexPromises);
      for (const cexData of cexResults) {
        results.push(...cexData.map(d => ({ ...d, pairId })));
      }
    } catch (error) {
      console.error('[CEX] Error fetching CEX data:', error);
    }
  }

  console.log(`[SwapData] Fetched ${results.length} data points for ${pair.name}`);
  return results;
}
