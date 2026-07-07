import axios from 'axios';
import { log, error, warn } from './logger';
import { QuoteResult } from './types';
import { mapLiFiRouteAlternative, mapLiFiRouteStep } from './lifi-route';

// Jumper migrated its domain exchange -> xyz; api.jumper.exchange no longer resolves (NXDOMAIN).
// This is the same pipeline proxy the jumper.xyz frontend uses. Keep options.integrator
// as 'jumper.exchange' (the LiFi-registered 0-fee integrator id) — using li.quest direct or
// integrator 'jumper.xyz' silently adds a 0.25% "LIFI Fixed Fee". Override with LIFI_API_BASE.
const JUMPER_API_BASE = process.env.LIFI_API_BASE || 'https://api.jumper.xyz/pipeline/v1/advanced/routes';
const LIFI_DIRECT_API = process.env.LIFI_DIRECT_API_BASE || 'https://li.quest/v1/advanced/routes';
const JUMPER_FROM_ADDRESS = process.env.LIFI_FROM_ADDRESS || '0x0000000000000000000000000000000000000001';
// client-side tool filter (both tool key and toolDetails.name, lowercased substring match)
const DENY_TOOL_NAMES = ['cow'];

const axiosInstance = axios.create({
  timeout: 20000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
});

type LiFiRequestOptions = {
  signal?: AbortSignal;
};

function isAbortError(err: unknown) {
  return axios.isAxiosError(err) && err.code === 'ERR_CANCELED';
}

const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new Error('LiFi/Jumper request aborted'));
    return;
  }

  const timeoutId = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);

  function onAbort() {
    clearTimeout(timeoutId);
    reject(new Error('LiFi/Jumper request aborted'));
  }

  signal?.addEventListener('abort', onAbort, { once: true });
});

// Slot-reservation limiter: each caller atomically claims the next time slot
// BEFORE awaiting, so concurrent callers serialize instead of all firing at once.
// (The old "read lastRequestTime, await, then write" design let every concurrent
// call read the same timestamp and stampede — that produced the 429s.)
class LiFiRateLimiter {
  private nextSlot = 0;
  private cooldownUntil = 0;
  private readonly minInterval = Number(process.env.LIFI_MIN_INTERVAL_MS) || 500; // ~2 RPS
  private readonly maxCooldownWait = Number(process.env.LIFI_MAX_COOLDOWN_WAIT_MS) || 30000;

  async waitForSlot(signal?: AbortSignal): Promise<void> {
    // A whole background sweep reserves its slots up front in one synchronous
    // burst (req1@T, req2@T+interval, ...). So a cooldown applied mid-sweep can't
    // be seen by already-reserved requests just by bumping nextSlot. Re-check the
    // cooldown AFTER waiting: if we wake inside a cooldown window, re-reserve a
    // fresh (later, re-spaced) slot — this both waits out the penalty and avoids a
    // thundering herd when the window lifts.
    for (;;) {
      const now = Date.now();
      const slot = Math.max(now, this.nextSlot);
      this.nextSlot = slot + this.minInterval; // reserve synchronously
      const wait = slot - now;
      if (wait > 0) await delay(wait, signal);
      if (signal?.aborted) throw new Error('LiFi/Jumper request aborted');
      const cooldownRemaining = this.cooldownUntil - Date.now();
      if (cooldownRemaining <= 0) return;
      if (cooldownRemaining > this.maxCooldownWait) {
        throw new Error(`LiFi/Jumper cooling down for ${Math.ceil(cooldownRemaining / 1000)}s`);
      }
    }
  }

  // Global cooldown: when one request hits 429, push every queued slot past the
  // server's Retry-After window so the whole fleet backs off together instead of
  // each request independently hammering into the same quota.
  penalize(ms: number): void {
    const until = Date.now() + ms;
    if (until > this.cooldownUntil) this.cooldownUntil = until;
    if (until > this.nextSlot) this.nextSlot = until;
  }
}

const GLOBAL_RATE_LIMITER_KEY = Symbol.for('stablejet.lifi.ratelimiter');
const rateLimiter: LiFiRateLimiter = (globalThis as any)[GLOBAL_RATE_LIMITER_KEY] || new LiFiRateLimiter();
(globalThis as any)[GLOBAL_RATE_LIMITER_KEY] = rateLimiter;

const MAX_RETRIES = Number(process.env.LIFI_MAX_RETRIES) || 3;
const ENABLE_DIRECT_FALLBACK = process.env.LIFI_DISABLE_DIRECT_FALLBACK !== '1';
const JUMPER_UNAVAILABLE_COOLDOWN_MS = Number(process.env.JUMPER_UNAVAILABLE_COOLDOWN_MS) || 10 * 60 * 1000;

const GLOBAL_JUMPER_CIRCUIT_KEY = Symbol.for('stablejet.lifi.jumperCircuit');
const jumperCircuit: { unavailableUntil: number } = (globalThis as any)[GLOBAL_JUMPER_CIRCUIT_KEY] || { unavailableUntil: 0 };
(globalThis as any)[GLOBAL_JUMPER_CIRCUIT_KEY] = jumperCircuit;

function isFallbackEligible(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;

  const status = err.response?.status;
  if (status) {
    // Railway egress IPs can be challenged by Cloudflare in ways that surface as
    // 403 or 52x responses. Route validation errors should stay on the primary
    // endpoint so we don't hide real quote/input problems.
    return status === 403 || status === 408 || status === 425 || status >= 500;
  }

  return [
    'ECONNABORTED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ERR_NETWORK'
  ].includes(err.code || '');
}

function describeAxiosError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : 'Unknown error';
  }

  const statusText = err.response?.statusText || '';
  const errorData = err.response?.data || '';
  return `${err.message} (status: ${err.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 200) : ''})`;
}

function parseRetryAfterMs(err: unknown, attempt: number): number {
  if (!axios.isAxiosError(err)) {
    return Math.min(500 * 2 ** attempt, 8000);
  }

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

  const responseData = err.response?.data;
  const body = typeof responseData === 'string'
    ? responseData
    : JSON.stringify(responseData || '');
  const retryMatch = body.match(/retry in\s+(\d+)\s*(second|minute|hour)s?/i);
  if (retryMatch) {
    const amount = Number(retryMatch[1]);
    const unit = retryMatch[2].toLowerCase();
    if (Number.isFinite(amount) && amount > 0) {
      if (unit === 'hour') return amount * 60 * 60 * 1000;
      if (unit === 'minute') return amount * 60 * 1000;
      return amount * 1000;
    }
  }

  return Math.min(500 * 2 ** attempt, 8000);
}

// POST to Jumper with: rate limiting, 429 backoff (honoring Retry-After), and a
// one-shot fallback to li.quest direct if Cloudflare/Railway egress blocks the proxy.
async function postToEndpointWithRetry(endpoint: string, payload: unknown, label: string, signal?: AbortSignal): Promise<{ data: any }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await rateLimiter.waitForSlot(signal);
    let requestLabel = label;
    try {
      const effectiveEndpoint = endpoint === JUMPER_API_BASE &&
        ENABLE_DIRECT_FALLBACK &&
        LIFI_DIRECT_API !== JUMPER_API_BASE &&
        Date.now() < jumperCircuit.unavailableUntil
          ? LIFI_DIRECT_API
          : endpoint;
      requestLabel = effectiveEndpoint === LIFI_DIRECT_API ? 'LiFi direct' : label;
      if (effectiveEndpoint !== endpoint) {
        warn('[LiFi/Jumper] Jumper circuit open, using li.quest direct');
      }
      return await axiosInstance.post<any>(effectiveEndpoint, payload, { signal });
    } catch (err) {
      lastErr = err;
      if (isAbortError(err)) throw err;
      if (!axios.isAxiosError(err)) throw err;
      const status = err.response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const backoff = parseRetryAfterMs(err, attempt);
        // Back the whole fleet off, not just this request — the quota is shared.
        rateLimiter.penalize(backoff);
        if (backoff > 30000) {
          warn(`[LiFi/Jumper] ${requestLabel} 429 rate limited for ${Math.ceil(backoff / 1000)}s; cooling down instead of retrying this quote`);
          throw err;
        }
        warn(`[LiFi/Jumper] ${requestLabel} 429 rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await delay(backoff, signal);
        continue;
      }
      warn(`[LiFi/Jumper] ${requestLabel} request failed: ${describeAxiosError(err)}`);
      throw err;
    }
  }
  throw lastErr;
}

async function postWithRetry(payload: unknown, options: LiFiRequestOptions = {}): Promise<{ data: any }> {
  if (
    ENABLE_DIRECT_FALLBACK &&
    LIFI_DIRECT_API !== JUMPER_API_BASE &&
    Date.now() < jumperCircuit.unavailableUntil
  ) {
    return postToEndpointWithRetry(LIFI_DIRECT_API, payload, 'LiFi direct', options.signal);
  }

  try {
    return await postToEndpointWithRetry(JUMPER_API_BASE, payload, 'Jumper', options.signal);
  } catch (err) {
    if (isAbortError(err)) throw err;
    if (
      ENABLE_DIRECT_FALLBACK &&
      LIFI_DIRECT_API !== JUMPER_API_BASE &&
      isFallbackEligible(err)
    ) {
      jumperCircuit.unavailableUntil = Date.now() + JUMPER_UNAVAILABLE_COOLDOWN_MS;
      warn(`[LiFi/Jumper] Jumper API unavailable from this runtime, falling back to li.quest direct: ${describeAxiosError(err)}`);
      return await postToEndpointWithRetry(LIFI_DIRECT_API, payload, 'LiFi direct', options.signal);
    }
    throw err;
  }
}

export async function getLiFiQuotesByChainId(
  chainId: string,
  fromToken: string,
  toToken: string,
  amountDecimals: string,
  options: LiFiRequestOptions = {}
): Promise<QuoteResult[]> {
  const result = await getLiFiQuoteByChainId(chainId, fromToken, toToken, amountDecimals, options);
  const alternatives = result.route?.alternatives;
  if (!alternatives || alternatives.length === 0) {
    return result.success ? [result] : [];
  }
  // Build a map from tool key → raw route for correct matching after deny-filter
  const rawRouteByTool = new Map<string, any>();
  const allRawRoutes: any[] = Array.isArray(result.route?.raw?.routes) ? result.route!.raw!.routes : [];
  for (const rawRoute of allRawRoutes) {
    const steps: any[] = Array.isArray(rawRoute?.steps) ? rawRoute.steps : [];
    const toolKey = steps.map((s: any) => s?.tool || '').join('/') || rawRoute?.tool || '';
    if (toolKey && !rawRouteByTool.has(toolKey)) rawRouteByTool.set(toolKey, rawRoute);
  }

  return alternatives.map((alt) => {
    const tool = alt.toolNames?.join(' / ') || 'unknown';
    // Match raw route by tool key for includedSteps and pool detail
    const toolKey = (alt.steps ?? []).map(s => s.tool || '').join('/') || tool.toLowerCase();
    const rawRoute = rawRouteByTool.get(toolKey) ?? allRawRoutes.find(r =>
      (r?.steps?.[0]?.tool || '').toLowerCase() === tool.split(' / ')[0].toLowerCase()
    );
    // Re-map steps from raw to capture includedSteps
    if (rawRoute?.steps) {
      alt.steps = rawRoute.steps.map((s: any) => mapLiFiRouteStep(s));
    }
    return {
      success: !!alt.toAmount,
      amountOut: alt.toAmount,
      amountOutUsd: alt.toAmountUSD,
      route: {
        type: 'lifi' as const,
        selectedTool: tool,
        alternatives: [alt],
      }
    };
  });
}

export async function getLiFiQuoteByChainId(
  chainId: string,
  fromToken: string,
  toToken: string,
  amountDecimals: string,
  options: LiFiRequestOptions = {}
): Promise<QuoteResult> {
  if (!chainId) {
    error('[LiFi/Jumper] Missing chainId');
    return { success: false, error: 'LiFi/Jumper missing chainId' };
  }

  const payload = {
    fromAddress: JUMPER_FROM_ADDRESS,
    fromAmount: amountDecimals,
    fromChainId: Number(chainId),
    fromTokenAddress: fromToken,
    toChainId: Number(chainId),
    toTokenAddress: toToken,
    options: {
      integrator: 'jumper.exchange',
      order: 'CHEAPEST',
      slippage: 0.0001,
      maxPriceImpact: 0.4,
      jitoBundle: true,
      allowSwitchChain: true,
      executionType: 'all'
    }
  };

  try {
    const response = await postWithRetry(payload, options);
    const data = response.data;
    const allRoutes = Array.isArray(data?.routes) ? data.routes : [];
    // Client-side filter: remove routes where any step or the route itself uses a denied tool
    function isDeniedTool(toolStr: string): boolean {
      const lower = toolStr.toLowerCase();
      for (const denied of DENY_TOOL_NAMES) {
        if (lower.includes(denied)) return true;
      }
      return false;
    }
    const routes = allRoutes.filter((route: any) => {
      if (isDeniedTool(route?.tool || '') || isDeniedTool(route?.toolDetails?.name || '')) return false;
      const steps: any[] = Array.isArray(route?.steps) ? route.steps : [];
      for (const step of steps) {
        if (isDeniedTool(step?.tool || '') || isDeniedTool(step?.toolDetails?.name || '')) return false;
      }
      return true;
    });
    const alternatives = routes.map((route: any) => mapLiFiRouteAlternative(route));
    const bestRoute = routes[0];
    const amountOut = bestRoute?.toAmount;
    const amountOutUsd = bestRoute?.toAmountUSD;
    const tool = alternatives[0]?.toolNames?.join(' / ')
      || bestRoute?.steps?.[0]?.tool
      || bestRoute?.steps?.[0]?.toolDetails?.name;

    if (amountOut) {
      log(`[LiFi/Jumper] ✓ Success for ${chainId}: ${amountOut} out (${tool || 'unknown tool'})`);
      return {
        success: true,
        amountOut,
        amountOutUsd,
        route: {
          type: 'lifi',
          raw: data,
          selectedTool: tool,
          alternatives,
          note: tool ? `tool: ${tool}` : undefined
        }
      };
    }

    warn(`[LiFi/Jumper] Quote missing amount for ${chainId}`);
    return {
      success: false,
      error: 'LiFi/Jumper quote missing amount',
      route: {
        type: 'lifi',
        raw: data,
        selectedTool: tool,
        alternatives,
        note: tool ? `tool: ${tool}` : undefined
      }
    };
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) {
      return { success: false, error: 'LiFi/Jumper request aborted' };
    }
    if (axios.isAxiosError(err)) {
      const message = describeAxiosError(err);
      error('[LiFi/Jumper] Error:', message);
      return { success: false, error: message };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    error('[LiFi/Jumper] Error:', message);
    return { success: false, error: message };
  }
}
