import axios from 'axios';
import { error, log } from './logger';
import { QuoteResult } from './types';

const JUPITER_LITE_API_BASE = 'https://lite-api.jup.ag/swap/v1';

const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'stablejet-monitor/1.0'
  }
});

export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountIn: string
): Promise<QuoteResult> {
  try {
    const response = await axiosInstance.get<any>(`${JUPITER_LITE_API_BASE}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount: amountIn,
        swapMode: 'ExactIn',
        slippageBps: 50
      }
    });

    const data = response.data;
    if (data?.outAmount) {
      log(`[Jupiter] ✓ Success: ${inputMint.slice(0, 6)}...→${outputMint.slice(0, 6)}... ${data.outAmount}`);
      return {
        success: true,
        amountOut: data.outAmount,
        amountOutUsd: data.swapUsdValue ? String(data.swapUsdValue) : undefined,
        route: {
          type: 'jupiter',
          paths: Array.isArray(data.routePlan) && data.routePlan.length > 0
            ? [[...data.routePlan.map((step: any) => ({
              pool: step?.swapInfo?.ammKey,
              tokenIn: step?.swapInfo?.inputMint,
              tokenOut: step?.swapInfo?.outputMint,
              swapAmount: step?.swapInfo?.inAmount,
              amountOut: step?.swapInfo?.outAmount,
              exchange: step?.swapInfo?.label
            }))]]
            : undefined,
          raw: data
        }
      };
    }

    return {
      success: false,
      error: 'Jupiter quote missing outAmount',
      route: {
        type: 'jupiter',
        raw: data
      }
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
      error('[Jupiter] Error:', message);
      return { success: false, error: message };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[Jupiter] Error:', message);
    return { success: false, error: message };
  }
}
