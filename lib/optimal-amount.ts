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

// 探测档位：以当前展示金额为基准的倍率。爬山搜索按需评估，通常只探 3 档
const LADDER_MULTIPLIERS = [0.1, 0.3, 1, 3, 10];
const BASE_INDEX = 2; // 1x

const ONCHAIN_SOURCE_KEYS = ['llamaswap', 'lifi', 'cetus', 'jupiter', 'panora', 'aftermath'] as const;

const CACHE_TTL_MS = 30_000;
const probeCache = new Map<string, { ts: number; result: ProbeResult }>();
let probeInFlight = false;

export class ProbeBusyError extends Error {
  constructor() { super('Another probe is in progress'); }
}

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

// 对单条腿实时询价（只询所需方向），返回同一 source 家族里输出最高的报价
async function quoteLeg({ pairId, chainKey, source, direction, amount }: LegParams):
  Promise<{ output: number | null; tool?: string }> {
  const config = getConfig();
  const pair = config.pairs[pairId];
  if (!pair) return { output: null };

  const [baseChainKey, wrapperSymbol] = chainKey.split('@');
  const chainPair = pair.chains[baseChainKey];
  if (!chainPair) return { output: null };

  // CEX：一次订单簿抓取可同时算两个方向，本身开销小
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

  // 直连池子：只带上当前上下文（主 tokenA 或对应 wrapper）的池
  const pools = (chainPair.pools ?? []).filter(p =>
    wrapperSymbol ? p.wrapper === wrapperSymbol : !p.wrapper
  );

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
    direction,
    pools: baseSource === 'pool' ? pools : [],
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

// 链式评估单个金额档位：卖腿输出作为买腿输入
async function evalPoint(params: ProbeParams, amount: number): Promise<ProbePoint> {
  const { pairId, sellChainKey, sellSource, buyChainKey, buySource } = params;
  const empty: ProbePoint = { amount, sellOutput: null, buyOutput: null, profitAmount: null, profitBps: null };
  try {
    const sell = await quoteLeg({ pairId, chainKey: sellChainKey, source: sellSource, direction: 'AtoB', amount });
    if (!sell.output || sell.output <= 0) return empty;
    const buy = await quoteLeg({ pairId, chainKey: buyChainKey, source: buySource, direction: 'BtoA', amount: sell.output });
    if (!buy.output || buy.output <= 0) return { ...empty, sellOutput: sell.output, sellTool: sell.tool };
    return {
      amount,
      sellOutput: sell.output,
      buyOutput: buy.output,
      profitAmount: buy.output - amount,
      profitBps: (buy.output / amount - 1) * 10000,
      sellTool: sell.tool,
      buyTool: buy.tool,
    };
  } catch {
    return empty;
  }
}

// 爬山搜索：从 1x 出发，沿利润上升方向逐档评估，利润回落即停。
// 典型 3 档、最差 5 档，且每档只询单方向，比全阶梯省 ~70% 外部请求。
export async function probeOptimalAmount(params: ProbeParams): Promise<ProbeResult> {
  const cacheKey = JSON.stringify([params.pairId, params.sellChainKey, params.sellSource,
    params.buyChainKey, params.buySource, params.baseAmount]);
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  if (probeInFlight) throw new ProbeBusyError();
  probeInFlight = true;
  try {
    const evaluated = new Map<number, ProbePoint>();
    const evalIdx = async (i: number): Promise<ProbePoint> => {
      let p = evaluated.get(i);
      if (!p) {
        p = await evalPoint(params, roundAmount(params.baseAmount * LADDER_MULTIPLIERS[i]));
        evaluated.set(i, p);
      }
      return p;
    };
    const profit = (p: ProbePoint) => p.profitAmount ?? -Infinity;

    const base = await evalIdx(BASE_INDEX);
    const up = await evalIdx(BASE_INDEX + 1);

    if (profit(up) > profit(base)) {
      let i = BASE_INDEX + 1;
      while (i + 1 < LADDER_MULTIPLIERS.length) {
        const next = await evalIdx(i + 1);
        if (profit(next) > profit(evaluated.get(i)!)) i++;
        else break;
      }
    } else {
      let i = BASE_INDEX;
      while (i - 1 >= 0) {
        const prev = await evalIdx(i - 1);
        if (profit(prev) > profit(evaluated.get(i)!)) i--;
        else break;
      }
    }

    const points = [...evaluated.values()].sort((a, b) => a.amount - b.amount);
    let best: ProbePoint | null = null;
    for (const p of points) {
      if (p.profitAmount === null) continue;
      if (best === null || p.profitAmount > (best.profitAmount ?? -Infinity)) best = p;
    }
    const result: ProbeResult = { points, best };
    probeCache.set(cacheKey, { ts: Date.now(), result });
    // 简单防膨胀
    if (probeCache.size > 200) {
      const oldest = [...probeCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) probeCache.delete(oldest[0]);
    }
    return result;
  } finally {
    probeInFlight = false;
  }
}
