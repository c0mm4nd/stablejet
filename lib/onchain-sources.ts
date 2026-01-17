import { fromWei, toWei } from './config';
import { ChainAppConfig, ChainSwapData, QuoteResult } from './types';
import { getQuote } from './kyberswap';
import { getNordsternQuoteByChainKey } from './nordstern';
import { getLiFiQuoteByChainId } from './lifi';

type SourceEntry = { source: 'kyberswap' | 'nordstern' | 'lifi'; aToB: QuoteResult; bToA: QuoteResult };

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
    appChainConfig
  } = params;

  const kyberChainParam = appChainConfig.kyberCode || chainKey;
  const nordsternChainParam = appChainConfig.nordsternCode || chainKey;
  const lifiChainId = appChainConfig.lifiChainId || appChainConfig.nordsternCode;
  const enableNordstern = !!appChainConfig.nordsternCode;
  const enableLiFi = !!lifiChainId;

  const amountInAToB = toWei(amount, tokenADecimals);
  const amountInBToA = toWei(amount, tokenBDecimals);

  const sources: SourceEntry[] = [];

  const kyberPromise = getQuote(kyberChainParam, tokenAAddress, tokenBAddress, amountInAToB)
    .then(aToB => getQuote(kyberChainParam, tokenBAddress, tokenAAddress, amountInBToA)
      .then(bToA => ({ source: 'kyberswap' as const, aToB, bToA })));

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

  const fetched = await Promise.all([
    kyberPromise,
    ...(nordsternPromise ? [nordsternPromise] : []),
    ...(lifiPromise ? [lifiPromise] : [])
  ]);

  sources.push(...fetched);

  const isUsdcUsdt = pairId === 'usdc_usdt';
  const results: ChainSwapData[] = [];

  for (const { source, aToB, bToA } of sources) {
    results.push({
      chain: chainName,
      chainKey,
      amount,
      pairId,
      dataSource: source,
      usdcToUsdt: isUsdcUsdt ? {
        input: amount,
        output: aToB.success && aToB.amountOut ? fromWei(aToB.amountOut, tokenBDecimals) : null,
        outputUsd: aToB.success && aToB.amountOutUsd ? parseFloat(aToB.amountOutUsd) : null,
        error: aToB.error,
        route: aToB.route
      } : { input: amount, output: null, outputUsd: null },
      usdtToUsdc: isUsdcUsdt ? {
        input: amount,
        output: bToA.success && bToA.amountOut ? fromWei(bToA.amountOut, tokenADecimals) : null,
        outputUsd: bToA.success && bToA.amountOutUsd ? parseFloat(bToA.amountOutUsd) : null,
        error: bToA.error,
        route: bToA.route
      } : { input: amount, output: null, outputUsd: null },
      tokenAToB: {
        input: amount,
        output: aToB.success && aToB.amountOut ? fromWei(aToB.amountOut, tokenBDecimals) : null,
        outputUsd: aToB.success && aToB.amountOutUsd ? parseFloat(aToB.amountOutUsd) : null,
        error: aToB.error,
        route: aToB.route
      },
      tokenBToA: {
        input: amount,
        output: bToA.success && bToA.amountOut ? fromWei(bToA.amountOut, tokenADecimals) : null,
        outputUsd: bToA.success && bToA.amountOutUsd ? parseFloat(bToA.amountOutUsd) : null,
        error: bToA.error,
        route: bToA.route
      }
    });
  }

  return results;
}
