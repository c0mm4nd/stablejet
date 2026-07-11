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
    sources
  } = params;
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
        getLlamaSwapQuotes({
          chainId: String(evmChainId),
          kyberChain: appChainConfig.kyberCode,
          fromToken: tokenAAddress,
          toToken: tokenBAddress,
          amountDecimals: amountInAToB,
          fromDecimals: tokenADecimals,
          toDecimals: tokenBDecimals
        }, { signal }),
        getLlamaSwapQuotes({
          chainId: String(evmChainId),
          kyberChain: appChainConfig.kyberCode,
          fromToken: tokenBAddress,
          toToken: tokenAAddress,
          amountDecimals: amountInBToA,
          fromDecimals: tokenBDecimals,
          toDecimals: tokenADecimals
        }, { signal })
      ])
    : null;

  const lifiOperation = enableLiFi && evmChainId
    ? (signal: AbortSignal) => Promise.all([
        getLiFiQuotesByChainId(String(evmChainId), tokenAAddress, tokenBAddress, amountInAToB, { signal }),
        getLiFiQuotesByChainId(String(evmChainId), tokenBAddress, tokenAAddress, amountInBToA, { signal })
      ])
    : null;

  const cetusPromise = enableCetus
    ? getCetusQuote(tokenAAddress, tokenBAddress, amountInAToB)
      .then(aToB => getCetusQuote(tokenBAddress, tokenAAddress, amountInBToA)
        .then(bToA => ({ source: 'cetus' as const, aToB, bToA })))
    : null;

  const jupiterPromise = enableJupiter
    ? getJupiterQuote(tokenAAddress, tokenBAddress, amountInAToB)
      .then(aToB => getJupiterQuote(tokenBAddress, tokenAAddress, amountInBToA)
        .then(bToA => ({ source: 'jupiter' as const, aToB, bToA })))
    : null;

  const panoraPromise = enablePanora
    ? getPanoraQuote(tokenAAddress, tokenBAddress, humanAmount, tokenBDecimals)
      .then(aToB => getPanoraQuote(tokenBAddress, tokenAAddress, humanAmount, tokenADecimals)
        .then(bToA => ({ source: 'panora' as const, aToB, bToA })))
    : null;

  const aftermathPromise = enableAftermath
    ? getAftermathQuote(tokenAAddress, tokenBAddress, amountInAToB)
      .then(aToB => getAftermathQuote(tokenBAddress, tokenAAddress, amountInBToA)
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
    for (const aToBResult of atoBResults) {
      const tool = aToBResult.route?.selectedTool || '';
      const bToAResult = btoAByTool.get(tool) ?? { success: false };
      sourceEntries.push({ source: `${sourcePrefix}/${tool}`, aToB: aToBResult, bToA: bToAResult });
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
