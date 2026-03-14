import axios from 'axios';
import { error, log } from './logger';
import { QuoteResult } from './types';

const PANORA_API_BASE = 'https://api.panora.exchange';
const PANORA_DEFAULT_API_KEY =
  process.env.PANORA_API_KEY ||
  'a4^KV_EaTf4MW#ZdvgGKX#HUD^3IFEAOV_kzpIE^3BQGA8pDnrkT7JcIy#HNlLGi';

const axiosInstance = axios.create({
  baseURL: PANORA_API_BASE,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    Referer: 'https://app.panora.exchange/',
    'User-Agent': 'stablejet-monitor/1.0',
    'x-api-key': PANORA_DEFAULT_API_KEY
  }
});

function humanAmountToBaseUnits(amount: string, decimals: number): string {
  const normalized = amount.trim().replace(/,/g, '');
  if (!normalized) return '0';

  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = (fractionRaw + '0'.repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0';

  return `${negative ? '-' : ''}${combined}`;
}

export async function getPanoraQuote(
  fromTokenAddress: string,
  toTokenAddress: string,
  amountInHuman: string,
  outputDecimals: number
): Promise<QuoteResult> {
  try {
    const response = await axiosInstance.post<any>('/swap', {}, {
      params: {
        chainId: '1',
        fromTokenAddress,
        toTokenAddress,
        fromTokenAmount: amountInHuman,
        slippagePercentage: '0.5'
      }
    });

    const data = response.data;
    const quote = Array.isArray(data?.quotes) ? data.quotes[0] : undefined;
    const amountOutHuman = quote?.toTokenAmount;
    if (amountOutHuman) {
      log(`[Panora] ✓ Success: ${fromTokenAddress.slice(0, 10)}...→${toTokenAddress.slice(0, 10)}... ${amountOutHuman}`);
      return {
        success: true,
        amountOut: humanAmountToBaseUnits(String(amountOutHuman), outputDecimals),
        amountOutUsd: quote?.toTokenAmountUSD ? String(quote.toTokenAmountUSD) : undefined,
        route: {
          type: 'panora',
          swaps: Array.isArray(quote?.route) ? quote.route : undefined,
          raw: data
        }
      };
    }

    return {
      success: false,
      error: 'Panora returned no quote',
      route: {
        type: 'panora',
        raw: data
      }
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const statusText = err.response?.statusText || '';
      const errorData = err.response?.data || '';
      const message = `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
      error('[Panora] Error:', message);
      return { success: false, error: message };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[Panora] Error:', message);
    return { success: false, error: message };
  }
}
