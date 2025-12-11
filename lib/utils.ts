import { ChainSwapData } from './types';

// 计算价差（基点 bps）
export function calculateSpreadBps(input: number, output: number | null): number | null {
  if (output === null) return null;
  // 基点 (basis points) = (output - input) / input * 10000
  return ((output - input) / input) * 10000;
}

// 计算绝对价差
export function calculateAbsoluteSpread(input: number, output: number | null): number | null {
  if (output === null) return null;
  return output - input;
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

// 格式化美元金额
export function formatUSD(amount: number | null): string {
  if (amount === null) return 'N/A';
  const sign = amount >= 0 ? '+' : '';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
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
