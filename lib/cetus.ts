import axios from 'axios';
import { error, log } from './logger';
import { QuoteResult, RouteHop } from './types';

const CETUS_AGGREGATOR_API_BASE = 'https://api-sui.cetus.zone/router_v3';
const CETUS_AGGREGATOR_VERSION = process.env.CETUS_AGGREGATOR_VERSION || '1010405';

const axiosInstance = axios.create({
  baseURL: CETUS_AGGREGATOR_API_BASE,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'stablejet-monitor/1.0'
  }
});

export async function getCetusQuote(
  fromCoinType: string,
  targetCoinType: string,
  amountIn: string
): Promise<QuoteResult> {
  try {
    const response = await axiosInstance.get<any>('/find_routes', {
      params: {
        from: fromCoinType,
        target: targetCoinType,
        amount: amountIn,
        by_amount_in: true,
        v: CETUS_AGGREGATOR_VERSION
      }
    });

    const payload = response.data;
    const data = payload?.data;
    if (payload?.code === 200 && data?.amount_out) {
      const hops: RouteHop[] = Array.isArray(data.paths)
        ? data.paths.map((path: any) => ({
          pool: path?.id,
          tokenIn: path?.from,
          tokenOut: path?.target,
          swapAmount: path?.amount_in ? String(path.amount_in) : undefined,
          amountOut: path?.amount_out ? String(path.amount_out) : undefined,
          exchange: path?.provider
        }))
        : [];

      log(`[Cetus] ✓ Success: ${fromCoinType.slice(0, 10)}...→${targetCoinType.slice(0, 10)}... ${data.amount_out}`);
      return {
        success: true,
        amountOut: String(data.amount_out),
        route: {
          type: 'cetus',
          paths: hops.length > 0 ? [hops] : undefined,
          raw: payload
        }
      };
    }

    return {
      success: false,
      error: payload?.msg || 'Cetus quote failed',
      route: {
        type: 'cetus',
        raw: payload
      }
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
      error('[Cetus] Error:', message);
      return { success: false, error: message };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[Cetus] Error:', message);
    return { success: false, error: message };
  }
}
