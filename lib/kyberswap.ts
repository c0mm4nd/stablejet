import { QuoteResult, KyberSwapQuoteResponse, ChainSwapData } from './types';
import { USDT_USDC_CHAINS, AMOUNTS, toWei, fromWei, getAllUnstableTokens } from './config';

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
    const response = await fetch(`${url}?${params}`, {
      headers: {
        'x-client-id': 'stablejet-monitor'
      },
      // 添加缓存策略以避免过多请求
      next: { revalidate: 10 }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: KyberSwapQuoteResponse = await response.json();

    if (data.code === 0 && data.data?.routeSummary) {
      // 检查路由路径是否包含不稳定代币
      if (data.data.routeSummary.route && hasUnstableTokenInRoute(data.data.routeSummary.route)) {
        return {
          success: false,
          error: 'Route contains unstable tokens (ETH/WETH/WBTC)'
        };
      }

      return {
        success: true,
        amountOut: data.data.routeSummary.amountOut,
        amountOutUsd: data.data.routeSummary.amountOutUsd
      };
    } else {
      return {
        success: false,
        error: data.message || 'No route found'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// 获取所有链的兑换数据
export async function getAllSwapData(): Promise<ChainSwapData[]> {
  const results: ChainSwapData[] = [];

  for (const [chainKey, chainConfig] of Object.entries(USDT_USDC_CHAINS)) {
    for (const amount of AMOUNTS) {
      const amountInWei = toWei(amount);

      // USDC -> USDT
      const usdcToUsdt = await getQuote(
        chainKey,
        chainConfig.usdc,
        chainConfig.usdt,
        amountInWei
      );

      // USDT -> USDC
      const usdtToUsdc = await getQuote(
        chainKey,
        chainConfig.usdt,
        chainConfig.usdc,
        amountInWei
      );

      results.push({
        chain: chainConfig.name,
        chainKey,
        amount,
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

  return results;
}
