import { ChainSwapData, ConfigData } from './types';

// 计算隐含汇率：output / input
export function calculateImpliedRate(input: number, output: number | null): number | null {
  if (output === null) return null;
  if (!Number.isFinite(input) || input === 0) return null;
  return output / input;
}

// 基于汇率的偏差（bps）：(rate - baseline) / baseline * 10000
export function calculateRateDeviationBps(rate: number | null, baselineRate: number | null): number | null {
  if (rate === null || baselineRate === null) return null;
  if (!Number.isFinite(rate) || !Number.isFinite(baselineRate) || baselineRate === 0) return null;
  return ((rate - baselineRate) / baselineRate) * 10000;
}

// 往返收益（bps）：(rateForward * rateBackward - 1) * 10000
export function calculateRoundTripBps(rateForward: number | null, rateBackward: number | null): number | null {
  if (rateForward === null || rateBackward === null) return null;
  if (!Number.isFinite(rateForward) || !Number.isFinite(rateBackward)) return null;
  return (rateForward * rateBackward - 1) * 10000;
}

// 按金额分组数据
export function groupDataByAmount(data: ChainSwapData[]): Record<number, ChainSwapData[]> {
  return data.reduce((acc, item) => {
    if (!acc[item.amount]) {
      acc[item.amount] = [];
    }
    acc[item.amount].push(item);
    return acc;
  }, {} as Record<number, ChainSwapData[]>);
}

// 格式化基点显示
export function formatBps(bps: number | null): string {
  if (bps === null) return 'N/A';
  const sign = bps >= 0 ? '+' : '';
  return `${sign}${bps.toFixed(2)} bps`;
}

// 计算中位数
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}

// 过滤异常值（超出中位数 ± threshold bps）
export function filterOutliers(value: number | null, allValues: (number | null)[], threshold: number = 10): number | null {
  if (value === null) return null;

  const validValues = allValues.filter((v): v is number => v !== null);
  if (validValues.length === 0) return value;

  const median = calculateMedian(validValues);

  // 如果超出中位数 ± threshold，返回 null
  if (Math.abs(value - median) > threshold) {
    return null;
  }

  return value;
}

const BTC_TOKENS = new Set(['BTC', 'WBTC', 'cbBTC', 'tBTC', 'LBTC', 'SolvBTC', 'uniBTC', 'eBTC', 'FBTC',
  'hemiBTC', 'BTCb', 'BTC.b', 'BTCB', 'BTCB.b']);
const ETH_TOKENS = new Set(['ETH', 'wstETH', 'weETH', 'rsETH', 'ezETH', 'stETH', 'cbETH', 'rETH',
  'ETHx', 'mETH', 'cmETH', 'osETH', 'frxETH', 'sfrxETH', 'OETH', 'pufETH',
  'wbETH', 'rswETH', 'tETH', 'STONE', 'pzETH', 'agETH',
  'uniETH', 'pxETH']);

export type PairCategory = 'stable' | 'eth' | 'btc';

export function getPairCategory(tokenA: string, tokenB: string): PairCategory {
  if ([tokenA, tokenB].some(t => BTC_TOKENS.has(t))) return 'btc';
  if ([tokenA, tokenB].some(t => ETH_TOKENS.has(t))) return 'eth';
  return 'stable';
}

export const CATEGORY_LABEL: Record<PairCategory, string> = {
  stable: 'Stablecoin',
  eth: 'ETH LST/LRT',
  btc: 'BTC',
};

export const CATEGORY_ORDER: PairCategory[] = ['stable', 'eth', 'btc'];

export function isSourceEnabled(
  source: string | undefined,
  sources?: Partial<ConfigData['sources']>
): boolean {
  const normalized = (source || 'unknown').toLowerCase();
  if (!sources) return true;
  // 'lifi/ToolName' → check sources.lifi
  const baseSource = normalized.startsWith('lifi/') ? 'lifi' : normalized;
  if (baseSource in sources) {
    return sources[baseSource as keyof ConfigData['sources']] !== false;
  }
  return true;
}
