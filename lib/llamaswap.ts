import axios from 'axios';
import { log, warn } from './logger';
import { QuoteResult, RouteAlternative, RouteAlternativeStep } from './types';

// LlamaSwap-style meta-aggregation (https://swap.defillama.com/).
// DefiLlama's own quote proxy (swap-api.defillama.com) sits behind a Cloudflare
// browser challenge, so servers can't call it. Instead we query the same
// underlying aggregators its frontend uses that work key-less server-side:
//   - KyberSwap  (aggregator-api.kyberswap.com, needs a chain slug)
//   - ParaSwap   (apiv5.paraswap.io, needs numeric chain id + token decimals)
//   - Odos       (api.odos.xyz — rate-limits key-less clients hard, so only
//                 enabled when ODOS_API_KEY is set)
const KYBER_API_BASE = process.env.KYBER_API_BASE || 'https://aggregator-api.kyberswap.com';
const KYBER_CLIENT_ID = process.env.KYBER_CLIENT_ID || 'stablejet';
const PARASWAP_API_BASE = process.env.PARASWAP_API_BASE || 'https://apiv5.paraswap.io';
const ODOS_API_BASE = process.env.ODOS_API_BASE || 'https://api.odos.xyz';
const ODOS_API_KEY = process.env.ODOS_API_KEY || '';

const PARASWAP_NETWORKS = new Set(['1', '10', '56', '100', '137', '250', '1101', '8453', '42161', '43114']);
const ODOS_CHAINS = new Set(['1', '10', '56', '130', '137', '146', '250', '324', '5000', '8453', '42161', '43114', '59144', '534352']);

const axiosInstance = axios.create({
  timeout: 20000,
  headers: { Accept: 'application/json' }
});

export type LlamaSwapQuoteParams = {
  chainId: string;        // EVM numeric chain id, e.g. "1"
  kyberChain?: string;    // KyberSwap chain slug, e.g. "ethereum" (skipped if empty)
  fromToken: string;
  toToken: string;
  amountDecimals: string; // amount in smallest units
  fromDecimals: number;
  toDecimals: number;
};

type LlamaSwapRequestOptions = {
  signal?: AbortSignal;
};

function isAbortError(err: unknown) {
  return axios.isAxiosError(err) && err.code === 'ERR_CANCELED';
}

const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new Error('LlamaSwap request aborted'));
    return;
  }

  const timeoutId = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);

  function onAbort() {
    clearTimeout(timeoutId);
    reject(new Error('LlamaSwap request aborted'));
  }

  signal?.addEventListener('abort', onAbort, { once: true });
});

// Slot-reservation limiter (same design as the Panora one): each caller
// atomically claims the next time slot BEFORE awaiting so concurrent callers
// serialize instead of stampeding, and a 429 penalizes the whole fleet.
class SlotRateLimiter {
  private nextSlot = 0;
  private cooldownUntil = 0;

  constructor(
    private readonly minInterval: number,
    private readonly maxCooldownWait: number,
    private readonly label: string
  ) {}

  async waitForSlot(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const now = Date.now();
      const slot = Math.max(now, this.nextSlot);
      this.nextSlot = slot + this.minInterval;
      const wait = slot - now;
      if (wait > 0) await delay(wait, signal);
      if (signal?.aborted) throw new Error('LlamaSwap request aborted');
      const cooldownRemaining = this.cooldownUntil - Date.now();
      if (cooldownRemaining <= 0) return;
      if (cooldownRemaining > this.maxCooldownWait) {
        throw new Error(`${this.label} cooling down for ${Math.ceil(cooldownRemaining / 1000)}s`);
      }
    }
  }

  penalize(ms: number): void {
    const until = Date.now() + ms;
    if (until > this.cooldownUntil) this.cooldownUntil = until;
    if (until > this.nextSlot) this.nextSlot = until;
  }
}

function globalLimiter(key: string, minInterval: number, label: string): SlotRateLimiter {
  const symbol = Symbol.for(`stablejet.llamaswap.${key}`);
  const existing = (globalThis as any)[symbol];
  if (existing) return existing;
  const limiter = new SlotRateLimiter(minInterval, 30000, label);
  (globalThis as any)[symbol] = limiter;
  return limiter;
}

const kyberLimiter = globalLimiter('kyber', Number(process.env.KYBER_MIN_INTERVAL_MS) || 350, 'KyberSwap');
const paraswapLimiter = globalLimiter('paraswap', Number(process.env.PARASWAP_MIN_INTERVAL_MS) || 1100, 'ParaSwap');
const odosLimiter = globalLimiter('odos', Number(process.env.ODOS_MIN_INTERVAL_MS) || 2100, 'Odos');

function describeAxiosError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : 'Unknown error';
  }

  const statusText = err.response?.statusText || '';
  const errorData = err.response?.data || '';
  return `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
}

function parseRetryAfterMs(err: unknown, attempt: number): number {
  if (axios.isAxiosError(err)) {
    const retryAfter = err.response?.headers?.['retry-after'];
    const retryAfterValue = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
    if (retryAfterValue) {
      const retryAfterSeconds = Number(retryAfterValue);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
      const retryAfterDate = Date.parse(retryAfterValue);
      if (Number.isFinite(retryAfterDate)) {
        return Math.max(0, retryAfterDate - Date.now());
      }
    }
  }
  return Math.min(500 * 2 ** attempt, 8000);
}

const MAX_RETRIES = Number(process.env.LLAMASWAP_MAX_RETRIES) || 2;

async function requestWithRetry<T>(
  limiter: SlotRateLimiter,
  label: string,
  doRequest: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await limiter.waitForSlot(signal);
    try {
      return await doRequest(signal);
    } catch (err) {
      lastErr = err;
      if (isAbortError(err)) throw err;
      if (!axios.isAxiosError(err)) throw err;
      const status = err.response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const backoff = parseRetryAfterMs(err, attempt);
        limiter.penalize(backoff);
        if (backoff > 30000) {
          warn(`[LlamaSwap] ${label} 429 rate limited for ${Math.ceil(backoff / 1000)}s; cooling down instead of retrying`);
          throw err;
        }
        warn(`[LlamaSwap] ${label} 429 rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await delay(backoff, signal);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

type AdapterQuote = {
  tool: string;
  amountOut: string;
  amountOutUsd?: string;
  gasCostUsd?: string;
  steps?: RouteAlternativeStep[];
};

// ── KyberSwap ────────────────────────────────────────────────────────────────

async function getKyberQuote(params: LlamaSwapQuoteParams, signal?: AbortSignal): Promise<AdapterQuote | null> {
  if (!params.kyberChain) return null;

  const url = `${KYBER_API_BASE}/${params.kyberChain}/api/v1/routes`;
  const response = await requestWithRetry(kyberLimiter, 'KyberSwap', s =>
    axiosInstance.get<any>(url, {
      params: {
        tokenIn: params.fromToken,
        tokenOut: params.toToken,
        amountIn: params.amountDecimals,
        gasInclude: true
      },
      headers: { 'x-client-id': KYBER_CLIENT_ID },
      signal: s
    }), signal);

  const summary = response.data?.data?.routeSummary;
  if (!summary?.amountOut) return null;

  const hops: any[] = Array.isArray(summary.route) ? summary.route.flat() : [];
  const includedSteps: RouteAlternativeStep[] = hops.map((hop: any) => ({
    type: 'swap',
    tool: hop?.exchange,
    toolName: hop?.exchange,
    fromAmount: hop?.swapAmount,
    toAmount: hop?.amountOut
  }));

  return {
    tool: 'KyberSwap',
    amountOut: String(summary.amountOut),
    amountOutUsd: summary.amountOutUsd ? String(summary.amountOutUsd) : undefined,
    gasCostUsd: summary.gasUsd ? String(summary.gasUsd) : undefined,
    steps: [{
      type: 'swap',
      tool: 'kyberswap',
      toolName: 'KyberSwap',
      fromChainId: Number(params.chainId),
      toChainId: Number(params.chainId),
      fromTokenDecimals: params.fromDecimals,
      toTokenDecimals: params.toDecimals,
      fromAmount: params.amountDecimals,
      toAmount: String(summary.amountOut),
      fromAmountUSD: summary.amountInUsd ? String(summary.amountInUsd) : undefined,
      toAmountUSD: summary.amountOutUsd ? String(summary.amountOutUsd) : undefined,
      includedSteps: includedSteps.length > 0 ? includedSteps : undefined
    }]
  };
}

// ── ParaSwap (Velora) ────────────────────────────────────────────────────────

async function getParaSwapQuote(params: LlamaSwapQuoteParams, signal?: AbortSignal): Promise<AdapterQuote | null> {
  if (!PARASWAP_NETWORKS.has(params.chainId)) return null;

  const response = await requestWithRetry(paraswapLimiter, 'ParaSwap', s =>
    axiosInstance.get<any>(`${PARASWAP_API_BASE}/prices/`, {
      params: {
        srcToken: params.fromToken,
        destToken: params.toToken,
        amount: params.amountDecimals,
        srcDecimals: params.fromDecimals,
        destDecimals: params.toDecimals,
        side: 'SELL',
        network: params.chainId
      },
      signal: s
    }), signal);

  const priceRoute = response.data?.priceRoute;
  if (!priceRoute?.destAmount) return null;

  const exchanges: any[] = [];
  for (const route of priceRoute.bestRoute || []) {
    for (const swap of route?.swaps || []) {
      for (const swapExchange of swap?.swapExchanges || []) {
        exchanges.push(swapExchange);
      }
    }
  }
  const includedSteps: RouteAlternativeStep[] = exchanges.map((swapExchange: any) => ({
    type: 'swap',
    tool: swapExchange?.exchange,
    toolName: swapExchange?.exchange,
    fromAmount: swapExchange?.srcAmount,
    toAmount: swapExchange?.destAmount
  }));

  return {
    tool: 'ParaSwap',
    amountOut: String(priceRoute.destAmount),
    amountOutUsd: priceRoute.destUSD ? String(priceRoute.destUSD) : undefined,
    gasCostUsd: priceRoute.gasCostUSD ? String(priceRoute.gasCostUSD) : undefined,
    steps: [{
      type: 'swap',
      tool: 'paraswap',
      toolName: 'ParaSwap',
      fromChainId: Number(params.chainId),
      toChainId: Number(params.chainId),
      fromTokenDecimals: params.fromDecimals,
      toTokenDecimals: params.toDecimals,
      fromAmount: params.amountDecimals,
      toAmount: String(priceRoute.destAmount),
      fromAmountUSD: priceRoute.srcUSD ? String(priceRoute.srcUSD) : undefined,
      toAmountUSD: priceRoute.destUSD ? String(priceRoute.destUSD) : undefined,
      includedSteps: includedSteps.length > 0 ? includedSteps : undefined
    }]
  };
}

// ── Odos ─────────────────────────────────────────────────────────────────────

async function getOdosQuote(params: LlamaSwapQuoteParams, signal?: AbortSignal): Promise<AdapterQuote | null> {
  if (!ODOS_API_KEY || !ODOS_CHAINS.has(params.chainId)) return null;

  const response = await requestWithRetry(odosLimiter, 'Odos', s =>
    axiosInstance.post<any>(`${ODOS_API_BASE}/sor/quote/v2`, {
      chainId: Number(params.chainId),
      inputTokens: [{ tokenAddress: params.fromToken, amount: params.amountDecimals }],
      outputTokens: [{ tokenAddress: params.toToken, proportion: 1 }],
      slippageLimitPercent: 0.3,
      compact: true
    }, {
      headers: { Authorization: `Bearer ${ODOS_API_KEY}` },
      signal: s
    }), signal);

  const data = response.data;
  const amountOut = data?.outAmounts?.[0];
  if (!amountOut) return null;

  return {
    tool: 'Odos',
    amountOut: String(amountOut),
    amountOutUsd: data.outValues?.[0] != null ? String(data.outValues[0]) : undefined,
    gasCostUsd: data.gasEstimateValue != null ? String(data.gasEstimateValue) : undefined,
    steps: [{
      type: 'swap',
      tool: 'odos',
      toolName: 'Odos',
      fromChainId: Number(params.chainId),
      toChainId: Number(params.chainId),
      fromTokenDecimals: params.fromDecimals,
      toTokenDecimals: params.toDecimals,
      fromAmount: params.amountDecimals,
      toAmount: String(amountOut),
      fromAmountUSD: data.inValues?.[0] != null ? String(data.inValues[0]) : undefined,
      toAmountUSD: data.outValues?.[0] != null ? String(data.outValues[0]) : undefined
    }]
  };
}

// ── Meta-aggregation ─────────────────────────────────────────────────────────

function toQuoteResult(params: LlamaSwapQuoteParams, quote: AdapterQuote): QuoteResult {
  const alternative: RouteAlternative = {
    fromAmount: params.amountDecimals,
    toAmount: quote.amountOut,
    toAmountUSD: quote.amountOutUsd,
    fromTokenDecimals: params.fromDecimals,
    toTokenDecimals: params.toDecimals,
    gasCostUSD: quote.gasCostUsd,
    toolNames: [quote.tool],
    stepCount: quote.steps?.length,
    steps: quote.steps
  };

  return {
    success: true,
    amountOut: quote.amountOut,
    amountOutUsd: quote.amountOutUsd,
    route: {
      type: 'llamaswap',
      selectedTool: quote.tool,
      alternatives: [alternative],
      note: `tool: ${quote.tool}`
    }
  };
}

const ADAPTERS: Array<(params: LlamaSwapQuoteParams, signal?: AbortSignal) => Promise<AdapterQuote | null>> = [
  getKyberQuote,
  getParaSwapQuote,
  getOdosQuote
];

// Queries every supported aggregator for the pair and returns one QuoteResult
// per aggregator (mirrors the old per-tool LiFi split, so downstream code can
// keep pairing A→B/B→A results by route.selectedTool).
export async function getLlamaSwapQuotes(
  params: LlamaSwapQuoteParams,
  options: LlamaSwapRequestOptions = {}
): Promise<QuoteResult[]> {
  if (!params.chainId) {
    warn('[LlamaSwap] Missing chainId');
    return [];
  }

  const settled = await Promise.all(ADAPTERS.map(async adapter => {
    try {
      return await adapter(params, options.signal);
    } catch (err) {
      if (isAbortError(err) || options.signal?.aborted) return null;
      warn(`[LlamaSwap] ${adapter.name} failed for chain ${params.chainId}: ${describeAxiosError(err)}`);
      return null;
    }
  }));

  const quotes = settled.filter((quote): quote is AdapterQuote => !!quote);
  if (quotes.length > 0) {
    log(`[LlamaSwap] ✓ ${quotes.length} quote(s) for chain ${params.chainId}: ${quotes.map(q => q.tool).join(', ')}`);
  }
  return quotes.map(quote => toQuoteResult(params, quote));
}
