import { getConfig } from './server-config';
import { getTokenDecimals } from './config';
import { getOnchainSwapDataForAmount } from './onchain-sources';
import { getBinanceSwapData } from './binance';
import { getMexcSwapData } from './mexc';
import { getBybitSwapData } from './bybit';
import { getBitgetSwapData } from './bitget';
import { getGateSwapData } from './gate';
import { getHtxSwapData } from './htx';
import { getKrakenSwapData } from './kraken';
import { getOkxSwapData } from './okx';
import { ChainSwapData, ConfigData } from './types';

const CEX_FETCHERS: Record<string, (amounts: number[], symbol: string) => Promise<ChainSwapData[]>> = {
  binance: getBinanceSwapData,
  mexc: getMexcSwapData,
  bybit: getBybitSwapData,
  bitget: getBitgetSwapData,
  gate: getGateSwapData,
  htx: getHtxSwapData,
  kraken: getKrakenSwapData,
  okx: getOkxSwapData,
};

// 探测阶梯：以当前展示金额为基准的倍率
const LADDER_MULTIPLIERS = [0.1, 0.3, 1, 3, 10];

const ONCHAIN_SOURCE_KEYS = ['llamaswap', 'lifi', 'cetus', 'jupiter', 'panora', 'aftermath'] as const;

export interface ProbePoint {
  amount: number;          // 输入的 tokenA 数量
  sellOutput: number | null; // A→B 得到的 tokenB
  buyOutput: number | null;  // B→A 换回的 tokenA
  profitAmount: number | null; // tokenA 计的利润
  profitBps: number | null;
  sellTool?: string;
  buyTool?: string;
}

export interface ProbeResult {
  points: ProbePoint[];
  best: ProbePoint | null;
}

interface LegParams {
  pairId: string;
  chainKey: string; // 可能带 wrapper 后缀，如 "ethereum@USDat"
  source: string;   // dataSource，如 "llamaswap/KyberSwap" 或 "binance"
  direction: 'AtoB' | 'BtoA';
  amount: number;
}

function roundAmount(value: number): number {
  return Number(value.toPrecision(6));
}

// 对单条腿实时询价，返回同一 source 家族里输出最高的报价
async function quoteLeg({ pairId, chainKey, source, direction, amount }: LegParams):
  Promise<{ output: number | null; tool?: string }> {
  const config = getConfig();
  const pair = config.pairs[pairId];
  if (!pair) return { output: null };

  const [baseChainKey, wrapperSymbol] = chainKey.split('@');
  const chainPair = pair.chains[baseChainKey];
  if (!chainPair) return { output: null };

  // CEX：直接用订单簿模拟
  const cexFetcher = CEX_FETCHERS[baseChainKey];
  if (cexFetcher) {
    if (!chainPair.cexPairSymbol) return { output: null };
    const rows = await cexFetcher([amount], chainPair.cexPairSymbol);
    const row = rows.find(r => r.amount === amount) ?? rows[0];
    const result = direction === 'AtoB' ? row?.tokenAToB : row?.tokenBToA;
    return { output: result?.output ?? null };
  }

  const appChainConfig = config.chains[baseChainKey];
  if (!appChainConfig || appChainConfig.disabled) return { output: null };

  let tokenAAddress = chainPair.addressA;
  let tokenADecimals = chainPair.decimalsA ?? getTokenDecimals(pair.tokenA);
  if (wrapperSymbol) {
    const wrapper = (chainPair.wrappers ?? []).find(w => w.symbol === wrapperSymbol);
    if (!wrapper) return { output: null };
    tokenAAddress = wrapper.address;
    tokenADecimals = wrapper.decimals;
  }
  const tokenBAddress = chainPair.addressB;
  const tokenBDecimals = chainPair.decimalsB ?? getTokenDecimals(pair.tokenB);
  if (!tokenAAddress || !tokenBAddress) return { output: null };

  // 只开启目标 source 家族，减少无关外呼
  const baseSource = source.split('/')[0].toLowerCase();
  const sources = { ...config.sources } as ConfigData['sources'];
  for (const key of ONCHAIN_SOURCE_KEYS) {
    (sources as unknown as Record<string, boolean>)[key] = key === baseSource;
  }

  const rows = await getOnchainSwapDataForAmount({
    pairId,
    chainKey,
    chainName: appChainConfig.name,
    amount,
    tokenAAddress,
    tokenBAddress,
    tokenADecimals,
    tokenBDecimals,
    appChainConfig,
    sources,
  });

  // 同家族内取输出最高的工具（聚合器在不同金额下可能换最优工具）
  let bestOutput: number | null = null;
  let bestTool: string | undefined;
  for (const row of rows) {
    const ds = (row.dataSource || '').toLowerCase();
    if (ds !== baseSource && !ds.startsWith(`${baseSource}/`)) continue;
    const result = direction === 'AtoB' ? row.tokenAToB : row.tokenBToA;
    if (result?.output && result.output > 0 && (bestOutput === null || result.output > bestOutput)) {
      bestOutput = result.output;
      bestTool = row.dataSource;
    }
  }
  return { output: bestOutput, tool: bestTool };
}

export interface ProbeParams {
  pairId: string;
  sellChainKey: string;
  sellSource: string;
  buyChainKey: string;
  buySource: string;
  baseAmount: number;
}

// 在金额阶梯上链式询价（卖腿输出作为买腿输入），找利润最高的档位
export async function probeOptimalAmount(params: ProbeParams): Promise<ProbeResult> {
  const { pairId, sellChainKey, sellSource, buyChainKey, buySource, baseAmount } = params;

  const points = await Promise.all(LADDER_MULTIPLIERS.map(async (m): Promise<ProbePoint> => {
    const amount = roundAmount(baseAmount * m);
    const empty: ProbePoint = { amount, sellOutput: null, buyOutput: null, profitAmount: null, profitBps: null };
    try {
      const sell = await quoteLeg({ pairId, chainKey: sellChainKey, source: sellSource, direction: 'AtoB', amount });
      if (!sell.output || sell.output <= 0) return empty;
      const buy = await quoteLeg({ pairId, chainKey: buyChainKey, source: buySource, direction: 'BtoA', amount: sell.output });
      if (!buy.output || buy.output <= 0) return { ...empty, sellOutput: sell.output, sellTool: sell.tool };
      const profitAmount = buy.output - amount;
      return {
        amount,
        sellOutput: sell.output,
        buyOutput: buy.output,
        profitAmount,
        profitBps: (buy.output / amount - 1) * 10000,
        sellTool: sell.tool,
        buyTool: buy.tool,
      };
    } catch {
      return empty;
    }
  }));

  let best: ProbePoint | null = null;
  for (const p of points) {
    if (p.profitAmount === null) continue;
    if (best === null || p.profitAmount > (best.profitAmount ?? -Infinity)) best = p;
  }
  return { points, best };
}
