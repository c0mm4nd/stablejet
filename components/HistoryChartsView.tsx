'use client';

import { HistoryDataPoint } from '@/lib/history';
import { AMOUNTS } from '@/lib/config';
import SpreadLineChart from './SpreadLineChart';
import CrossChainArbitrageChart from './CrossChainArbitrageChart';

interface HistoryChartsViewProps {
  history: HistoryDataPoint[];
}

export default function HistoryChartsView({ history }: HistoryChartsViewProps) {
  if (history.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <p className="text-gray-600">暂无历史数据，请等待数据收集...</p>
        <p className="text-sm text-gray-500 mt-2">数据每 10 秒更新一次</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {AMOUNTS.map((amount) => (
        <div key={amount} className="space-y-6">
          {/* 双向价差对比图 */}
          <SpreadLineChart history={history} amount={amount} />

          {/* 跨链套利机会图 */}
          <CrossChainArbitrageChart history={history} amount={amount} />

          {/* 分隔线 */}
          <div className="border-t-2 border-gray-200 my-8"></div>
        </div>
      ))}
    </div>
  );
}
