import { ChainSwapData } from './types';

export interface HistoryDataPoint {
  timestamp: string;
  data: ChainSwapData[];
}

// In-memory history store. History was previously persisted to SQLite on a
// Railway volume, but only the most recent points were ever kept, so a
// process-lifetime ring buffer serves the same purpose without any disk state.
// History resets on each deploy and refills from the background fetcher.
const MAX_HISTORY_POINTS = Number(process.env.MAX_HISTORY_POINTS) || 100;

// Survive Next.js dev-server HMR module reloads
const GLOBAL_HISTORY_KEY = Symbol.for('stablejet.history.points');
const historyPoints: HistoryDataPoint[] =
  (globalThis as any)[GLOBAL_HISTORY_KEY] || [];
(globalThis as any)[GLOBAL_HISTORY_KEY] = historyPoints;

// 保存新的数据点
export function saveDataPoint(data: ChainSwapData[], pairId: string) {
  const timestamp = new Date().toISOString();
  const quoteTimestamp = timestamp;

  historyPoints.push({
    timestamp,
    data: data.map(item => ({
      ...item,
      pairId: item.pairId || pairId,
      quoteTimestamp: item.quoteTimestamp || quoteTimestamp
    }))
  });

  // 清理旧数据，只保留最近的数据点
  if (historyPoints.length > MAX_HISTORY_POINTS) {
    historyPoints.splice(0, historyPoints.length - MAX_HISTORY_POINTS);
  }
}

// 获取指定时间范围的历史数据
export function getHistoryInRange(hours: number = 24, pairId?: string): HistoryDataPoint[] {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  return historyPoints
    .filter(point => point.timestamp >= cutoffTime)
    .map(point => ({
      timestamp: point.timestamp,
      data: pairId ? point.data.filter(item => item.pairId === pairId) : point.data
    }))
    .filter(point => point.data.length > 0);
}
