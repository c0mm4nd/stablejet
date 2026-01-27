import { error } from './logger';
import { getTokenDecimals } from './config';
import { getOnchainSwapDataForAmount } from './onchain-sources';
import { getBinanceSwapData } from './binance';
import { getMexcSwapData } from './mexc';
import { getBybitSwapData } from './bybit';
import { getBitgetSwapData } from './bitget';
import { getGateSwapData } from './gate';
import { getHtxSwapData } from './htx';
import { getKrakenSwapData } from './kraken';
import { ChainAppConfig, ChainSwapData, TradingPairConfig, ConfigData } from './types';

export async function getSwapDataForPair(
  pairConfig: TradingPairConfig,
  chainsConfig: Record<string, ChainAppConfig>,
  sources?: ConfigData['sources']
): Promise<ChainSwapData[]> {
  const results: ChainSwapData[] = [];
  const pairId = pairConfig.id;
  const amounts = pairConfig.amounts;

  const defaultTokenADecimals = getTokenDecimals(pairConfig.tokenA);
  const defaultTokenBDecimals = getTokenDecimals(pairConfig.tokenB);

  const tasks: Array<Promise<ChainSwapData[]>> = [];

  for (const [chainKey, chainPairData] of Object.entries(pairConfig.chains)) {
    // Check if chain is globally enabled
    const appChainConfig = chainsConfig[chainKey];
    if (!appChainConfig || appChainConfig.disabled) continue;

    // Check if pair is enabled on this chain
    if (chainPairData.disabled) continue;

    // Determine effective decimals for this chain
    const tokenADecimals = chainPairData.decimalsA ?? defaultTokenADecimals;
    const tokenBDecimals = chainPairData.decimalsB ?? defaultTokenBDecimals;

    // CEX Logic: Fetch if configured in the pair's chain map
    if (['binance', 'mexc', 'bybit', 'bitget', 'gate', 'htx', 'kraken'].includes(chainKey)) {
      if (sources) {
        if (chainKey === 'binance' && sources.binance === false) continue;
        if (chainKey === 'mexc' && sources.mexc === false) continue;
        if (chainKey === 'bybit' && sources.bybit === false) continue;
        if (chainKey === 'bitget' && sources.bitget === false) continue;
        if (chainKey === 'gate' && sources.gate === false) continue;
        if (chainKey === 'htx' && sources.htx === false) continue;
        if (chainKey === 'kraken' && sources.kraken === false) continue;
      }
      const symbol = chainPairData.cexPairSymbol;
      if (!symbol) continue;

      const cexTask = (async () => {
        try {
          let cexData: ChainSwapData[] = [];
          if (chainKey === 'binance') {
            cexData = await getBinanceSwapData(amounts, symbol);
          } else if (chainKey === 'mexc') {
            cexData = await getMexcSwapData(amounts, symbol);
          } else if (chainKey === 'bybit') {
            cexData = await getBybitSwapData(amounts, symbol);
          } else if (chainKey === 'bitget') {
            cexData = await getBitgetSwapData(amounts, symbol);
          } else if (chainKey === 'gate') {
            cexData = await getGateSwapData(amounts, symbol);
          } else if (chainKey === 'htx') {
            cexData = await getHtxSwapData(amounts, symbol);
          } else if (chainKey === 'kraken') {
            cexData = await getKrakenSwapData(amounts, symbol);
          }
          return cexData.map(d => ({ ...d, pairId }));
        } catch (err) {
          error(`[CEX] Error fetching ${chainKey} data:`, err);
          return [];
        }
      })();

      tasks.push(cexTask);
      continue;
    }

    const tokenAAddress = chainPairData.addressA;
    const tokenBAddress = chainPairData.addressB;

    if (!tokenAAddress || !tokenBAddress) continue;

    for (const amount of amounts) {
      const onchainTask = getOnchainSwapDataForAmount({
        pairId,
        chainKey,
        chainName: appChainConfig.name,
        amount,
        tokenAAddress,
        tokenBAddress,
        tokenADecimals,
        tokenBDecimals,
        appChainConfig,
        sources
      }).catch(err => {
        error(`[Onchain] Error fetching ${chainKey} data:`, err);
        return [];
      });
      tasks.push(onchainTask);
    }
  }

  const batches = await Promise.all(tasks);
  batches.forEach(batch => results.push(...batch));

  return results;
}
