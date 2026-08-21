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

// 自适应搜索参数：无固定档位。先按 EXPAND_RATIO 动态扩展包围利润峰值，
// 再在区间内做对数空间黄金分割，收敛到相邻评估点比率 < TOLERANCE_RATIO
const EXPAND_RATIO = 2.5;
const SEARCH_BOUND = 64;       // 搜索范围：base/64 ~ base*64
const TOLERANCE_RATIO = 1.15;  // 收敛精度 ±7%
const MAX_EVALS = 14;          // 单次探测评估上限

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
    const evaluated = new Map<number, ProbePoint>(); // key: 实际金额
    let evals = 0;
    const ev = async (mult: number): Promise<ProbePoint> => {
      const amount = roundAmount(params.baseAmount * mult);
      let p = evaluated.get(amount);
      if (!p) {
        evals++;
        p = await evalPoint(params, amount);
        evaluated.set(amount, p);
      }
      return p;
    };
    const profit = (p: ProbePoint) => p.profitAmount ?? -Infinity;
    const f = async (mult: number) => profit(await ev(mult));

    // 阶段一：从 1x 出发按 EXPAND_RATIO 动态扩展，包围利润峰值
    const r = EXPAND_RATIO;
    let lo = 1, hi = 1; // 包围区间（倍率）
    const p1 = await f(1);
    const pUp = await f(r);
    if (pUp > p1) {
      // 上行扩展直到回落
      let prev = 1, cur = r;
      let curP = pUp;
      while (cur * r <= SEARCH_BOUND && evals < MAX_EVALS - 4) {
        const nextP = await f(cur * r);
        if (nextP <= curP) break;
        prev = cur; cur *= r; curP = nextP;
      }
      lo = prev; hi = Math.min(cur * r, SEARCH_BOUND);
    } else {
      const pDown = await f(1 / r);
      if (pDown > p1) {
        // 下行扩展直到回落
        let prev = 1, cur = 1 / r;
        let curP = pDown;
        while (cur / r >= 1 / SEARCH_BOUND && evals < MAX_EVALS - 4) {
          const nextP = await f(cur / r);
          if (nextP <= curP) break;
          prev = cur; cur /= r; curP = nextP;
        }
        lo = Math.max(cur / r, 1 / SEARCH_BOUND); hi = prev;
      } else {
        lo = 1 / r; hi = r; // 峰值在两侧邻点之间
      }
    }

    // 阶段二：对数空间黄金分割，收敛到 TOLERANCE_RATIO
    const PHI = (Math.sqrt(5) - 1) / 2; // 0.618
    let a = Math.log(lo), b = Math.log(hi);
    let x1 = b - PHI * (b - a);
    let x2 = a + PHI * (b - a);
    let f1 = await f(Math.exp(x1));
    let f2 = await f(Math.exp(x2));
    while (Math.exp(b - a) > TOLERANCE_RATIO && evals < MAX_EVALS) {
      if (f1 >= f2) {
        b = x2; x2 = x1; f2 = f1;
        x1 = b - PHI * (b - a);
        f1 = await f(Math.exp(x1));
      } else {
        a = x1; x1 = x2; f1 = f2;
        x2 = a + PHI * (b - a);
        f2 = await f(Math.exp(x2));
      }
    }

    const points = [...evaluated.values()].sort((a2, b2) => a2.amount - b2.amount);
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
