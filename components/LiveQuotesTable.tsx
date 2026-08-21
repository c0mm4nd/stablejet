'use client';

import { useState, useMemo } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { calculateImpliedRate, calculateMedian, calculateRateDeviationBps, calculateRoundTripBps, isSourceEnabled } from '@/lib/utils';
import { useConfig } from '@/contexts/ConfigContext';
import RouteDetailsModal from '@/components/RouteDetailsModal';
import { extractLiFiAlternatives } from '@/lib/lifi-route';
import { getSourceInfo } from '@/lib/source-metadata';
import { RouteInfo } from '@/lib/types';

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
  timestamp: string;
  routeAtoB?: RouteInfo;
  routeBtoA?: RouteInfo;
}

interface RawRow {
  chain: string;
  dataSource: string;
  outputAtoB: number | null;
  outputBtoA: number | null;
  arbitrageSpace: number | null;
  rateAtoB: number | null;
  rateBtoA: number | null;
  timestamp: string;
  routeAtoB?: RouteInfo;
  routeBtoA?: RouteInfo;
}

export default function LiveQuotesTable({ history, amount, pairId }: LiveQuotesTableProps) {
  const { pairs, sources } = useConfig();
  const [sortKey, setSortKey] = useState<SortKey>('arbitrageSpace');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [activeRoute, setActiveRoute] = useState<{
    chain: string;
    source: string;
    routeAtoB?: RouteInfo;
    routeBtoA?: RouteInfo;
  } | null>(null);

  if (history.length === 0) {
    return null;
  }

  const pair = pairs[pairId];
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
  const timestamp = new Date(latestData.timestamp).toLocaleString('en-US');

  // 准备表格数据
  const tableData: TableRow[] = useMemo(() => {
    const rawRows: RawRow[] = latestData.data
      .filter(item => item.amount === amount)
      .filter(item => isSourceEnabled(item.dataSource, sources))
      .map(item => {
        const source = item.dataSource || 'unknown';
        const tokenAToB = item.tokenAToB;
        const tokenBToA = item.tokenBToA;

        const rateAtoB = tokenAToB ? calculateImpliedRate(tokenAToB.input, tokenAToB.output) : null;
        const rateBtoA = tokenBToA ? calculateImpliedRate(tokenBToA.input, tokenBToA.output) : null;

        return {
          chain: item.chain,
          dataSource: source,
          outputAtoB: tokenAToB?.output ?? null,
          outputBtoA: tokenBToA?.output ?? null,
          // 往返收益 bps：rateAtoB * rateBtoA - 1
          arbitrageSpace: calculateRoundTripBps(rateAtoB, rateBtoA),
          rateAtoB,
          rateBtoA,
          timestamp: item.quoteTimestamp || latestData.timestamp,
          routeAtoB: tokenAToB?.route,
          routeBtoA: tokenBToA?.route
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
      timestamp: r.timestamp,
      routeAtoB: r.routeAtoB,
      routeBtoA: r.routeBtoA
    }));
  }, [latestData, amount, sources]);

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
      <RouteDetailsModal
        activeRoute={activeRoute}
        onClose={() => setActiveRoute(null)}
        tokenA={pair.tokenA}
        tokenB={pair.tokenB}
      />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Input amount: {amount.toLocaleString()} - Live quotes ({sortedData.length} chains)
        </h2>
        <span className="text-sm text-gray-500">
          Updated: {timestamp}
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
                  Chain
                  <SortIcon columnKey="chain" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('dataSource')}
              >
                <div className="flex items-center gap-2">
                  Source
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
                  Spread (bps)
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
                  Spread (bps)
                  <SortIcon columnKey="spreadBtoA" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('arbitrageSpace')}
              >
                <div className="flex items-center justify-end gap-2">
                  Arb spread (bps)
                  <SortIcon columnKey="arbitrageSpace" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedData.map((row, idx) => {
              const sourceDisplayInfo = getSourceInfo(row.dataSource);
              const rowTime = new Date(row.timestamp).toLocaleString('en-US');
              const lifiRouteCounts = row.dataSource === 'lifi'
                ? {
                  aToB: extractLiFiAlternatives(row.routeAtoB).length,
                  bToA: extractLiFiAlternatives(row.routeBtoA).length
                }
                : null;

              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors" title={`Quote time: ${rowTime}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.chain}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2"
                      onClick={() => setActiveRoute({ chain: row.chain, source: sourceDisplayInfo.name, routeAtoB: row.routeAtoB, routeBtoA: row.routeBtoA })}
                    >
                      <span className={`font-semibold ${sourceDisplayInfo.color}`}>
                        {sourceDisplayInfo.name}
                      </span>
                      {lifiRouteCounts && (lifiRouteCounts.aToB > 0 || lifiRouteCounts.bToA > 0) && (
                        <>
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                            {pair.tokenA} {'->'} {pair.tokenB} {lifiRouteCounts.aToB}
                          </span>
                          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                            {pair.tokenB} {'->'} {pair.tokenA} {lifiRouteCounts.bToA}
                          </span>
                        </>
                      )}
                      <span className="text-xs text-gray-400">ⓘ</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.outputAtoB !== null ? (
                      <span className="text-gray-700">
                        {row.outputAtoB.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-red-500 text-xs">Error</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.spreadAtoB !== null ? (
                      <span className={`font-semibold ${row.spreadAtoB >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.spreadAtoB >= 0 ? '+' : ''}{row.spreadAtoB.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.outputBtoA !== null ? (
                      <span className="text-gray-700">
                        {row.outputBtoA.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-red-500 text-xs">Error</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.spreadBtoA !== null ? (
                      <span className={`font-semibold ${row.spreadBtoA >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.spreadBtoA >= 0 ? '+' : ''}{row.spreadBtoA.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.arbitrageSpace !== null ? (
                      <span className={`font-bold ${row.arbitrageSpace >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.arbitrageSpace >= 0 ? '+' : ''}{row.arbitrageSpace.toFixed(6)}
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
        Spread (bps) = deviation from the median rate across all sources |
        Arb spread (bps) = ({pair.tokenA}→{pair.tokenB} rate × {pair.tokenB}→{pair.tokenA} rate - 1) × 10000 |
        Click column headers to sort
      </div>
    </div>
  );
}
