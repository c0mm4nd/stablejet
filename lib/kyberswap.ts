import axios from 'axios';
import { error } from './logger';
import { QuoteResult, KyberSwapQuoteResponse, ChainSwapData, TradingPairConfig, ChainAppConfig, ConfigData } from './types';
import { getAllUnstableTokens, getTokenDecimals } from './config';
import { getOnchainSwapDataForAmount } from './onchain-sources';
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

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.kyberswap.ratelimiter');

const rateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new KyberSwapRateLimiter();
if (process.env.NODE_ENV !== 'production') (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

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
  const params = {
    tokenIn,
    tokenOut,
    amountIn,
    gasInclude: 'true'
  };

  try {
    // 等待速率限制器允许
    await rateLimiter.waitForSlot();

    const response = await axiosInstance.get<KyberSwapQuoteResponse>(url, { params });
    const data = response.data;

    if (data.code === 0 && data.data?.routeSummary) {
      return {
        success: true,
        amountOut: data.data.routeSummary.amountOut,
        amountOutUsd: data.data.routeSummary.amountOutUsd,
        route: {
          type: 'kyberswap',
          paths: data.data.routeSummary.route
        }
      };
    } else {
      error(`[KyberSwap] No route found for ${chainClean}: ${data.message || 'Unknown'}`);
      return {
        success: false,
        error: data.message || 'No route found'
      };
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''})`;
      error(`[KyberSwap] Error for ${chainClean}:`, message);
      return {
        success: false,
        error: message
      };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    error(`[KyberSwap] Error for ${chainClean}:`, message);
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

// 获取指定交易对的兑换数据
export async function getSwapDataForPair(
  pairConfig: TradingPairConfig,
  chainsConfig: Record<string, ChainAppConfig>,
  dexAggregators?: ConfigData['dexAggregators']
): Promise<ChainSwapData[]> {
  const results: ChainSwapData[] = [];
  const pairId = pairConfig.id;
  const amounts = pairConfig.amounts;

  const defaultTokenADecimals = getTokenDecimals(pairConfig.tokenA);
  const defaultTokenBDecimals = getTokenDecimals(pairConfig.tokenB);

  // console.log(`[SwapData] Fetching data for pair: ${pairConfig.name} (${pairId})`);

  for (const [chainKey, chainPairData] of Object.entries(pairConfig.chains)) {
    // Check if chain is globally enabled
    const appChainConfig = chainsConfig[chainKey];
    if (!appChainConfig || appChainConfig.disable) continue;

    // Check if pair is enabled on this chain
    // (Our new type doesn't have disable on chainPairData yet, but good to check if we added it)
    if (chainPairData.disabled) continue;

    // Determine effective decimals for this chain
    const tokenADecimals = chainPairData.decimalsA ?? defaultTokenADecimals;
    const tokenBDecimals = chainPairData.decimalsB ?? defaultTokenBDecimals;

    // CEX Logic: Fetch if configured in the pair's chain map
    if (['binance', 'mexc', 'bybit'].includes(chainKey)) {
      const symbol = chainPairData.cexPairSymbol;
      if (!symbol) continue; // Skip if no symbol and not default pair

      try {
        let cexData: ChainSwapData[] = [];
        if (chainKey === 'binance') {
          cexData = await getBinanceSwapData(amounts, symbol);
        } else if (chainKey === 'mexc') {
          cexData = await getMexcSwapData(amounts, symbol);
        } else if (chainKey === 'bybit') {
          cexData = await getBybitSwapData(amounts, symbol);
        }

        results.push(...cexData.map(d => ({ ...d, pairId })));
      } catch (err) {
        error(`[CEX] Error fetching ${chainKey} data:`, err);
      }
      continue;
    }

    const tokenAAddress = chainPairData.addressA;
    const tokenBAddress = chainPairData.addressB;

    if (!tokenAAddress || !tokenBAddress) continue;

    for (const amount of amounts) {
      const onchainRows = await getOnchainSwapDataForAmount({
        pairId,
        chainKey,
        chainName: appChainConfig.name,
        amount,
        tokenAAddress,
        tokenBAddress,
        tokenADecimals,
        tokenBDecimals,
        appChainConfig,
        dexAggregators
      });

      results.push(...onchainRows);
    }
  }

  // console.log(`[SwapData] Fetched ${results.length} data points for ${pair.name}`);
  return results;
}
