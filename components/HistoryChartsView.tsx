'use client';

import { useState } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import SpreadLineChart from './SpreadLineChart';
import CrossChainArbitrageChart from './CrossChainArbitrageChart';
import LiveQuotesTable from './LiveQuotesTable';

interface HistoryChartsViewProps {
  history: HistoryDataPoint[];
  pairId: string;
}

export default function HistoryChartsView({ history, pairId }: HistoryChartsViewProps) {
  const { amounts, chains } = useConfig();
  // 全局时间窗口状态（单位：分钟）
  const [timeWindow, setTimeWindow] = useState(10);

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center border border-gray-100">
        <p className="text-gray-600">暂无历史数据，请等待数据收集...</p>
        <p className="text-sm text-gray-500 mt-2">数据每 10 秒更新一次</p>
      </div>
    );
  }

  // 根据时间窗口过滤历史数据
  const now = Date.now();
  const windowMs = timeWindow * 60 * 1000;
  const enabledChainNames = Object.values(chains).map(c => c.name);

  const filteredHistory = history
    .filter(point => {
      const pointTime = new Date(point.timestamp).getTime();
      return now - pointTime <= windowMs;
    })
    .map(point => ({
      ...point,
      // 只保留配置中启用的链和金额
      data: point.data.filter(item =>
        enabledChainNames.includes(item.chain) &&
        amounts.includes(item.amount)
      )
    }))
    .filter(point => point.data.length > 0); // 过滤掉没有数据的时间点

  return (
    <div className="space-y-6">
      {/* 全局时间窗口选择器 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="flex justify-center items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-600">时间范围</span>
          {[5, 10, 30, 60].map(minutes => (
            <button
              key={minutes}
              onClick={() => setTimeWindow(minutes)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                timeWindow === minutes
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {minutes < 60 ? `${minutes}分钟` : '1小时'}
            </button>
          ))}
          <span className="text-sm text-gray-400">
            {filteredHistory.length} 个数据点
          </span>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="space-y-8">
        {amounts.map((amount, index) => (
          <div key={amount} className="space-y-6">
            {/* 实时报价数据表 - 显示所有数据，不受配置过滤影响 */}
            <LiveQuotesTable history={history} amount={amount} pairId={pairId} />

            {/* 双向价差对比图 */}
            <SpreadLineChart history={filteredHistory} amount={amount} pairId={pairId} />

            {/* 跨链套利机会图 */}
            <CrossChainArbitrageChart history={filteredHistory} amount={amount} />

            {/* 分隔线 */}
            {index < amounts.length - 1 && (
              <div className="border-t border-white/10 my-8"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
