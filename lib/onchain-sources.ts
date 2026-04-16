import { fromWei, toWei } from './config';
import { ChainAppConfig, ChainSwapData, QuoteResult, ConfigData } from './types';
import { getQuote } from './kyberswap';
import { getNordsternQuoteByChainKey } from './nordstern';
import { getLiFiQuoteByChainId } from './lifi';
import { getCetusQuote } from './cetus';
import { getJupiterQuote } from './jupiter';
import { getPanoraQuote } from './panora';
import { getAftermathQuote } from './aftermath';
import { getZeroXQuote } from './zerox';
import { normalizeSources } from './source-metadata';

type SourceEntry = {
  source: NonNullable<ChainSwapData['dataSource']>;
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

  const kyberChainParam = appChainConfig.kyberCode || chainKey;
  const nordsternChainParam = appChainConfig.nordsternCode || chainKey;
  const lifiChainId = appChainConfig.lifiChainId || appChainConfig.nordsternCode;
  const enableKyber = normalizedSources.kyberswap !== false && !!appChainConfig.kyberCode;
  const enableNordstern = normalizedSources.nordstern !== false && !!appChainConfig.nordsternCode;
  const enableLiFi = normalizedSources.lifi !== false && !!lifiChainId;
  const zeroXChainId = appChainConfig.zeroXChainId;
  const enableZeroX = normalizedSources.zerox !== false && !!zeroXChainId;
  const enableCetus = normalizedSources.cetus !== false && chainKey === 'sui';
  const enableJupiter = normalizedSources.jupiter !== false && chainKey === 'solana';
  const enablePanora = normalizedSources.panora !== false && chainKey === 'aptos';
  const enableAftermath = normalizedSources.aftermath !== false && chainKey === 'sui';

  const amountInAToB = toWei(amount, tokenADecimals);
  const amountInBToA = toWei(amount, tokenBDecimals);
  const humanAmount = String(amount);

  const sourceEntries: SourceEntry[] = [];

  const kyberPromise = enableKyber
    ? getQuote(kyberChainParam, tokenAAddress, tokenBAddress, amountInAToB)
      .then(aToB => getQuote(kyberChainParam, tokenBAddress, tokenAAddress, amountInBToA)
        .then(bToA => ({ source: 'kyberswap' as const, aToB, bToA })))
    : null;

  const nordsternPromise = enableNordstern
    ? getNordsternQuoteByChainKey(nordsternChainParam, tokenAAddress, tokenBAddress, amountInAToB)
      .then(aToB => getNordsternQuoteByChainKey(nordsternChainParam, tokenBAddress, tokenAAddress, amountInBToA)
        .then(bToA => ({ source: 'nordstern' as const, aToB, bToA })))
    : null;

  const lifiPromise = enableLiFi && lifiChainId
    ? getLiFiQuoteByChainId(String(lifiChainId), tokenAAddress, tokenBAddress, amountInAToB)
      .then(aToB => getLiFiQuoteByChainId(String(lifiChainId), tokenBAddress, tokenAAddress, amountInBToA)
        .then(bToA => ({ source: 'lifi' as const, aToB, bToA })))
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

  const zeroXPromise = enableZeroX && zeroXChainId
    ? getZeroXQuote(zeroXChainId, tokenAAddress, tokenBAddress, amountInAToB)
      .then(aToB => getZeroXQuote(zeroXChainId, tokenBAddress, tokenAAddress, amountInBToA)
        .then(bToA => ({ source: 'zerox' as const, aToB, bToA })))
    : null;

  const fetched = await Promise.all([
    ...(kyberPromise ? [kyberPromise] : []),
    ...(nordsternPromise ? [nordsternPromise] : []),
    ...(lifiPromise ? [lifiPromise] : []),
    ...(cetusPromise ? [cetusPromise] : []),
    ...(jupiterPromise ? [jupiterPromise] : []),
    ...(panoraPromise ? [panoraPromise] : []),
    ...(aftermathPromise ? [aftermathPromise] : []),
    ...(zeroXPromise ? [zeroXPromise] : [])
  ]);

  sourceEntries.push(...fetched);

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
