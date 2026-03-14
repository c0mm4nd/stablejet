import axios from 'axios';
import { error, log } from './logger';
import { QuoteResult, RouteHop } from './types';

const AFTERMATH_ROUTER_API_BASE = 'https://aftermath.finance/api/router';

const axiosInstance = axios.create({
  baseURL: AFTERMATH_ROUTER_API_BASE,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'stablejet-monitor/1.0'
  }
});

function stripBigIntSuffix(value?: string): string | undefined {
  if (!value) return undefined;
  return value.endsWith('n') ? value.slice(0, -1) : value;
}

export async function getAftermathQuote(
  coinInType: string,
  coinOutType: string,
  amountIn: string
): Promise<QuoteResult> {
  try {
    const response = await axiosInstance.post<any>('/trade-route', {
      coinInType,
      coinOutType,
      coinInAmount: `${amountIn}n`
    });

    const data = response.data;
    const amountOut = stripBigIntSuffix(data?.coinOut?.amount);
    const paths = Array.isArray(data?.routes)
      ? data.routes.map((route: any) =>
        Array.isArray(route?.paths)
          ? route.paths.map((path: any): RouteHop => ({
            pool: path?.poolId,
            tokenIn: path?.coinIn?.type,
            tokenOut: path?.coinOut?.type,
            swapAmount: stripBigIntSuffix(path?.coinIn?.amount),
            amountOut: stripBigIntSuffix(path?.coinOut?.amount),
            exchange: path?.protocolName
          }))
          : []
      ).filter((route: RouteHop[]) => route.length > 0)
      : undefined;

    if (amountOut) {
      log(`[Aftermath] ✓ Success: ${coinInType.slice(0, 10)}...→${coinOutType.slice(0, 10)}... ${amountOut}`);
      return {
        success: true,
        amountOut,
        route: {
          type: 'aftermath',
          paths,
          raw: data
        }
      };
    }

    return {
      success: false,
      error: 'Aftermath quote missing coinOut.amount',
      route: {
        type: 'aftermath',
        paths,
        raw: data
      }
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
      error('[Aftermath] Error:', message);
      return { success: false, error: message };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[Aftermath] Error:', message);
    return { success: false, error: message };
  }
}
