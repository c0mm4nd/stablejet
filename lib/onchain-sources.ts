import { fromWei, toWei } from './config';
import { ChainAppConfig, ChainSwapData, QuoteResult, ConfigData } from './types';
import { getLiFiQuotesByChainId } from './lifi';
import { getCetusQuote } from './cetus';
import { getJupiterQuote } from './jupiter';
import { getPanoraQuote } from './panora';
import { getAftermathQuote } from './aftermath';
import { normalizeSources } from './source-metadata';

type SourceEntry = {
  source: string;
  aToB: QuoteResult;
  bToA: QuoteResult;
};

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

  const lifiChainId = appChainConfig.lifiChainId;
  const enableLiFi = normalizedSources.lifi !== false && !!lifiChainId;
  const enableCetus = normalizedSources.cetus !== false && chainKey === 'sui';
  const enableJupiter = normalizedSources.jupiter !== false && chainKey === 'solana';
  const enablePanora = normalizedSources.panora !== false && chainKey === 'aptos';
  const enableAftermath = normalizedSources.aftermath !== false && chainKey === 'sui';

  const amountInAToB = toWei(amount, tokenADecimals);
  const amountInBToA = toWei(amount, tokenBDecimals);
  const humanAmount = String(amount);

  const sourceEntries: SourceEntry[] = [];

  const lifiPromise = enableLiFi && lifiChainId
    ? Promise.all([
        getLiFiQuotesByChainId(String(lifiChainId), tokenAAddress, tokenBAddress, amountInAToB),
        getLiFiQuotesByChainId(String(lifiChainId), tokenBAddress, tokenAAddress, amountInBToA)
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

  const [fetched, lifiPair] = await Promise.all([
    Promise.all([
      ...(cetusPromise ? [cetusPromise] : []),
      ...(jupiterPromise ? [jupiterPromise] : []),
      ...(panoraPromise ? [panoraPromise] : []),
      ...(aftermathPromise ? [aftermathPromise] : [])
    ]),
    lifiPromise ?? Promise.resolve(null)
  ]);

  sourceEntries.push(...fetched);

  // Expand LiFi results: pair A→B and B→A alternatives by tool name
  if (lifiPair) {
    const [atoBResults, btoAResults] = lifiPair;
    const btoAByTool = new Map<string, QuoteResult>();
    for (const r of btoAResults) {
      const tool = r.route?.selectedTool || '';
      btoAByTool.set(tool, r);
    }
    for (const aToBResult of atoBResults) {
      const tool = aToBResult.route?.selectedTool || '';
      const bToAResult = btoAByTool.get(tool) ?? { success: false };
      sourceEntries.push({ source: `lifi/${tool}`, aToB: aToBResult, bToA: bToAResult });
    }
  }

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
