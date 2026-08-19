import { fromWei, toWei } from './config';
import { ChainAppConfig, ChainSwapData, QuoteResult, ConfigData } from './types';
import { getLiFiQuotesByChainId } from './lifi';
import { getLlamaSwapQuotes } from './llamaswap';
import { getCetusQuote } from './cetus';
import { getJupiterQuote } from './jupiter';
import { getPanoraQuote } from './panora';
import { getAftermathQuote } from './aftermath';
import { normalizeSources } from './source-metadata';
import { warn } from './logger';

type SourceEntry = {
  source: string;
  aToB: QuoteResult;
  bToA: QuoteResult;
};

const AGGREGATOR_PAIR_TIMEOUT_MS = Number(process.env.LLAMASWAP_PAIR_TIMEOUT_MS)
  || Number(process.env.LIFI_PAIR_TIMEOUT_MS)
  || 90000;

async function withAggregatorTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  sourceLabel: string,
  label: string
): Promise<T | null> {
  let timeoutId: NodeJS.Timeout | null = null;
  const controller = new AbortController();
  const timeout = new Promise<null>(resolve => {
    timeoutId = setTimeout(() => {
      warn(`[${sourceLabel}] ${label} timed out after ${AGGREGATOR_PAIR_TIMEOUT_MS}ms; continuing without ${sourceLabel} for this quote`);
      controller.abort();
      resolve(null);
    }, AGGREGATOR_PAIR_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      operation(controller.signal).catch(err => {
        if (controller.signal.aborted) {
          return null;
        }
        warn(`[${sourceLabel}] ${label} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return null;
      }),
      timeout
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

interface OnchainSourceParams {
  pairId: string;
  chainKey: string;
  chainName: string;
  amount: number;
  tokenAAddress: string;
  tokenBAddress: string;
  tokenADecimals: number;
  tokenBDecimals: number;
  appChainConfig: ChainAppConfig;
  sources?: ConfigData['sources'];
  direction?: 'AtoB' | 'BtoA' | 'both'; // 只询单方向可省一半外部请求
}

export async function getOnchainSwapDataForAmount(params: OnchainSourceParams): Promise<ChainSwapData[]> {
  const {
    pairId,
    chainKey,
    chainName,
    amount,
    tokenAAddress,
    tokenBAddress,
    tokenADecimals,
    tokenBDecimals,
    appChainConfig,
    sources,
    direction = 'both'
  } = params;
  const needAtoB = direction !== 'BtoA';
  const needBtoA = direction !== 'AtoB';
  const SKIPPED: QuoteResult = { success: false };
  const normalizedSources = normalizeSources(sources);

  const evmChainId = appChainConfig.lifiChainId;
  const enableLlamaSwap = normalizedSources.llamaswap !== false && !!evmChainId;
  const enableLiFi = normalizedSources.lifi !== false && !!evmChainId;
  const enableCetus = normalizedSources.cetus !== false && chainKey === 'sui';
  const enableJupiter = normalizedSources.jupiter !== false && chainKey === 'solana';
  const enablePanora = normalizedSources.panora !== false && chainKey === 'aptos';
  const enableAftermath = normalizedSources.aftermath !== false && chainKey === 'sui';

  const amountInAToB = toWei(amount, tokenADecimals);
  const amountInBToA = toWei(amount, tokenBDecimals);
  const humanAmount = String(amount);

  const sourceEntries: SourceEntry[] = [];

  const llamaSwapOperation = enableLlamaSwap && evmChainId
    ? (signal: AbortSignal) => Promise.all([
        needAtoB ? getLlamaSwapQuotes({
          chainId: String(evmChainId),
          kyberChain: appChainConfig.kyberCode,
          fromToken: tokenAAddress,
          toToken: tokenBAddress,
          amountDecimals: amountInAToB,
          fromDecimals: tokenADecimals,
          toDecimals: tokenBDecimals
        }, { signal }) : Promise.resolve([] as QuoteResult[]),
        needBtoA ? getLlamaSwapQuotes({
          chainId: String(evmChainId),
          kyberChain: appChainConfig.kyberCode,
          fromToken: tokenBAddress,
          toToken: tokenAAddress,
          amountDecimals: amountInBToA,
          fromDecimals: tokenBDecimals,
          toDecimals: tokenADecimals
        }, { signal }) : Promise.resolve([] as QuoteResult[])
      ])
    : null;

  const lifiOperation = enableLiFi && evmChainId
    ? (signal: AbortSignal) => Promise.all([
        needAtoB
          ? getLiFiQuotesByChainId(String(evmChainId), tokenAAddress, tokenBAddress, amountInAToB, { signal })
          : Promise.resolve([] as QuoteResult[]),
        needBtoA
          ? getLiFiQuotesByChainId(String(evmChainId), tokenBAddress, tokenAAddress, amountInBToA, { signal })
          : Promise.resolve([] as QuoteResult[])
      ])
    : null;

  const cetusPromise = enableCetus
    ? (needAtoB ? getCetusQuote(tokenAAddress, tokenBAddress, amountInAToB) : Promise.resolve(SKIPPED))
      .then(aToB => (needBtoA ? getCetusQuote(tokenBAddress, tokenAAddress, amountInBToA) : Promise.resolve(SKIPPED))
        .then(bToA => ({ source: 'cetus' as const, aToB, bToA })))
    : null;

  const jupiterPromise = enableJupiter
    ? (needAtoB ? getJupiterQuote(tokenAAddress, tokenBAddress, amountInAToB) : Promise.resolve(SKIPPED))
      .then(aToB => (needBtoA ? getJupiterQuote(tokenBAddress, tokenAAddress, amountInBToA) : Promise.resolve(SKIPPED))
        .then(bToA => ({ source: 'jupiter' as const, aToB, bToA })))
    : null;

  const panoraPromise = enablePanora
    ? (needAtoB ? getPanoraQuote(tokenAAddress, tokenBAddress, humanAmount, tokenBDecimals) : Promise.resolve(SKIPPED))
      .then(aToB => (needBtoA ? getPanoraQuote(tokenBAddress, tokenAAddress, humanAmount, tokenADecimals) : Promise.resolve(SKIPPED))
        .then(bToA => ({ source: 'panora' as const, aToB, bToA })))
    : null;

  const aftermathPromise = enableAftermath
    ? (needAtoB ? getAftermathQuote(tokenAAddress, tokenBAddress, amountInAToB) : Promise.resolve(SKIPPED))
      .then(aToB => (needBtoA ? getAftermathQuote(tokenBAddress, tokenAAddress, amountInBToA) : Promise.resolve(SKIPPED))
        .then(bToA => ({ source: 'aftermath' as const, aToB, bToA })))
    : null;

  const pairLabel = `${pairId}/${chainKey}/${amount}`;
  const [fetched, llamaSwapPair, lifiPair] = await Promise.all([
    Promise.all([
      ...(cetusPromise ? [cetusPromise] : []),
      ...(jupiterPromise ? [jupiterPromise] : []),
      ...(panoraPromise ? [panoraPromise] : []),
      ...(aftermathPromise ? [aftermathPromise] : [])
    ]),
    llamaSwapOperation
      ? withAggregatorTimeout(llamaSwapOperation, 'LlamaSwap', pairLabel)
      : Promise.resolve(null),
    lifiOperation
      ? withAggregatorTimeout(lifiOperation, 'LiFi/Jumper', pairLabel)
      : Promise.resolve(null)
  ]);

  sourceEntries.push(...fetched);

  // Expand aggregator results: pair A→B and B→A quotes by tool name
  function expandAggregatorPair(
    pair: [QuoteResult[], QuoteResult[]] | null,
    sourcePrefix: string
  ) {
    if (!pair) return;
    const [atoBResults, btoAResults] = pair;
    const btoAByTool = new Map<string, QuoteResult>();
    for (const r of btoAResults) {
      const tool = r.route?.selectedTool || '';
      btoAByTool.set(tool, r);
    }
    const seenTools = new Set<string>();
    for (const aToBResult of atoBResults) {
      const tool = aToBResult.route?.selectedTool || '';
      seenTools.add(tool);
      const bToAResult = btoAByTool.get(tool) ?? { success: false };
      sourceEntries.push({ source: `${sourcePrefix}/${tool}`, aToB: aToBResult, bToA: bToAResult });
    }
    // 只询 B→A 方向时 atoBResults 为空，这里补上仅出现在 B→A 的工具
    for (const [tool, bToAResult] of btoAByTool) {
      if (seenTools.has(tool)) continue;
      sourceEntries.push({ source: `${sourcePrefix}/${tool}`, aToB: { success: false }, bToA: bToAResult });
    }
  }

  expandAggregatorPair(llamaSwapPair, 'llamaswap');
  expandAggregatorPair(lifiPair, 'lifi');

  const results: ChainSwapData[] = [];

  for (const { source, aToB, bToA } of sourceEntries) {
    const tokenAToB = {
      input: amount,
      output: aToB.success && aToB.amountOut ? fromWei(aToB.amountOut, tokenBDecimals) : null,
      outputUsd: aToB.success && aToB.amountOutUsd ? parseFloat(aToB.amountOutUsd) : null,
      error: aToB.error,
      route: aToB.route
    };
    const tokenBToA = {
      input: amount,
      output: bToA.success && bToA.amountOut ? fromWei(bToA.amountOut, tokenADecimals) : null,
      outputUsd: bToA.success && bToA.amountOutUsd ? parseFloat(bToA.amountOutUsd) : null,
      error: bToA.error,
      route: bToA.route
    };
    results.push({
      chain: chainName,
      chainKey,
      amount,
      pairId,
      dataSource: source,
      tokenAToB,
      tokenBToA
    });
  }

  return results;
}
