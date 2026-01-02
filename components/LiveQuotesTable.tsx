'use client';

import { useState, useMemo } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { calculateImpliedRate, calculateMedian, calculateRateDeviationBps, calculateRoundTripBps } from '@/lib/utils';
import { TRADING_PAIRS } from '@/lib/config';

interface LiveQuotesTableProps {
  history: HistoryDataPoint[];
  amount: number;
  pairId: string;
}

type SortKey = 'chain' | 'dataSource' | 'spreadAtoB' | 'spreadBtoA' | 'arbitrageSpace' | 'outputAtoB' | 'outputBtoA';
type SortDirection = 'asc' | 'desc';

interface TableRow {
  chain: string;
  dataSource: string;
  outputAtoB: number | null;
  outputBtoA: number | null;
  spreadAtoB: number | null;
  spreadBtoA: number | null;
  arbitrageSpace: number | null;
}

interface RawRow {
  chain: string;
  dataSource: string;
  outputAtoB: number | null;
  outputBtoA: number | null;
  arbitrageSpace: number | null;
  rateAtoB: number | null;
  rateBtoA: number | null;
}

export default function LiveQuotesTable({ history, amount, pairId }: LiveQuotesTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('arbitrageSpace');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  if (history.length === 0) {
    return null;
  }

  const pair = TRADING_PAIRS[pairId];
  if (!pair) {
    return null;
  }

  // 只使用最近10分钟的数据点（如果有的话）
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10分钟
  const recentHistory = history.filter(point => {
    const pointTime = new Date(point.timestamp).getTime();
    return now - pointTime <= windowMs;
  });

  // 获取最新的数据点
  const latestData = recentHistory.length > 0 
    ? recentHistory[recentHistory.length - 1] 
    : history[history.length - 1];
  const timestamp = new Date(latestData.timestamp).toLocaleString('zh-CN');

  // 数据源显示名称和颜色
  const sourceInfo: Record<string, { name: string; color: string }> = {
    kyberswap: { name: 'KyberSwap', color: 'text-blue-600' },
    openocean: { name: 'OpenOcean', color: 'text-purple-600' },
    binance: { name: 'Binance', color: 'text-yellow-600' },
    bybit: { name: 'Bybit', color: 'text-orange-600' },
    mexc: { name: 'MEXC', color: 'text-green-600' }
  };

  // 准备表格数据
  const tableData: TableRow[] = useMemo(() => {
    const rawRows: RawRow[] = latestData.data
      .filter(item => item.amount === amount)
      .map(item => {
        const source = item.dataSource || 'kyberswap';
        const tokenAToB = item.tokenAToB || item.usdcToUsdt;
        const tokenBToA = item.tokenBToA || item.usdtToUsdc;

        const rateAtoB = calculateImpliedRate(tokenAToB.input, tokenAToB.output);
        const rateBtoA = calculateImpliedRate(tokenBToA.input, tokenBToA.output);

        return {
          chain: item.chain,
          dataSource: source,
          outputAtoB: tokenAToB.output,
          outputBtoA: tokenBToA.output,
          // 往返收益 bps：rateAtoB * rateBtoA - 1
          arbitrageSpace: calculateRoundTripBps(rateAtoB, rateBtoA),
          rateAtoB,
          rateBtoA,
        };
      });

    const ratesAtoB = rawRows.map(r => r.rateAtoB).filter((r): r is number => r !== null);
    const ratesBtoA = rawRows.map(r => r.rateBtoA).filter((r): r is number => r !== null);
    const baselineAtoB = ratesAtoB.length > 0 ? calculateMedian(ratesAtoB) : null;
    const baselineBtoA = ratesBtoA.length > 0 ? calculateMedian(ratesBtoA) : null;

    return rawRows.map(r => ({
      chain: r.chain,
      dataSource: r.dataSource,
      outputAtoB: r.outputAtoB,
      outputBtoA: r.outputBtoA,
      spreadAtoB: calculateRateDeviationBps(r.rateAtoB, baselineAtoB),
      spreadBtoA: calculateRateDeviationBps(r.rateBtoA, baselineBtoA),
      arbitrageSpace: r.arbitrageSpace,
    }));
  }, [latestData, amount]);

  // 排序数据
  const sortedData = useMemo(() => {
    const data = [...tableData];
    data.sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      // 处理 null 值，null 总是排在最后
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // 字符串比较
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // 数字比较
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [tableData, sortKey, sortDirection]);

  // 排序处理
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // 排序图标
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <span className="text-gray-400">⇅</span>;
    }
    return <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          输入数量: {amount.toLocaleString()} - 实时报价数据 (共 {sortedData.length} 个链)
        </h2>
        <span className="text-sm text-gray-500">
          更新时间: {timestamp}
        </span>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th 
                className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('chain')}
              >
                <div className="flex items-center gap-2">
                  链名称
                  <SortIcon columnKey="chain" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('dataSource')}
              >
                <div className="flex items-center gap-2">
                  数据源
                  <SortIcon columnKey="dataSource" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('outputAtoB')}
              >
                <div className="flex items-center justify-end gap-2">
                  {pair.tokenA}→{pair.tokenB}
                  <SortIcon columnKey="outputAtoB" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('spreadAtoB')}
              >
                <div className="flex items-center justify-end gap-2">
                  价差 (bps)
                  <SortIcon columnKey="spreadAtoB" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('outputBtoA')}
              >
                <div className="flex items-center justify-end gap-2">
                  {pair.tokenB}→{pair.tokenA}
                  <SortIcon columnKey="outputBtoA" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('spreadBtoA')}
              >
                <div className="flex items-center justify-end gap-2">
                  价差 (bps)
                  <SortIcon columnKey="spreadBtoA" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('arbitrageSpace')}
              >
                <div className="flex items-center justify-end gap-2">
                  套利空间 (bps)
                  <SortIcon columnKey="arbitrageSpace" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedData.map((row, idx) => {
              const sourceDisplayInfo = sourceInfo[row.dataSource] || { name: row.dataSource, color: 'text-gray-600' };
              
              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.chain}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${sourceDisplayInfo.color}`}>
                      {sourceDisplayInfo.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.outputAtoB !== null ? (
                      <span className="text-gray-700">
                        {row.outputAtoB.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-red-500 text-xs">错误</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.spreadAtoB !== null ? (
                      <span className={`font-semibold ${row.spreadAtoB >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.spreadAtoB >= 0 ? '+' : ''}{row.spreadAtoB.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.outputBtoA !== null ? (
                      <span className="text-gray-700">
                        {row.outputBtoA.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-red-500 text-xs">错误</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.spreadBtoA !== null ? (
                      <span className={`font-semibold ${row.spreadBtoA >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.spreadBtoA >= 0 ? '+' : ''}{row.spreadBtoA.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.arbitrageSpace !== null ? (
                      <span className={`font-bold ${row.arbitrageSpace >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.arbitrageSpace >= 0 ? '+' : ''}{row.arbitrageSpace.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        价差 (bps) = 相对“全体中位数汇率”的偏差 | 
        套利空间 (bps) = ({pair.tokenA}→{pair.tokenB} 汇率 × {pair.tokenB}→{pair.tokenA} 汇率 - 1) × 10000 |
        点击列标题可排序
      </div>
    </div>
  );
}
