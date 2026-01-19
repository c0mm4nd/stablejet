'use client';

import { useState, useMemo } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { calculateImpliedRate, calculateMedian, calculateRateDeviationBps, calculateRoundTripBps, isSourceEnabled } from '@/lib/utils';
import { useConfig } from '@/contexts/ConfigContext';

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
  routeAtoB?: any;
  routeBtoA?: any;
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
  routeAtoB?: any;
  routeBtoA?: any;
}

export default function LiveQuotesTable({ history, amount, pairId }: LiveQuotesTableProps) {
  const { pairs, sources } = useConfig();
  const [sortKey, setSortKey] = useState<SortKey>('arbitrageSpace');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [activeRoute, setActiveRoute] = useState<{
    chain: string;
    source: string;
    routeAtoB?: any;
    routeBtoA?: any;
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
  const timestamp = new Date(latestData.timestamp).toLocaleString('zh-CN');

  // 数据源显示名称和颜色
  const sourceInfo: Record<string, { name: string; color: string }> = {
    kyberswap: { name: 'KyberSwap', color: 'text-blue-600' },
    nordstern: { name: 'Nordstern', color: 'text-cyan-600' },
    lifi: { name: 'Li.Fi', color: 'text-teal-600' },
    binance: { name: 'Binance', color: 'text-yellow-600' },
    bybit: { name: 'Bybit', color: 'text-orange-600' },
    mexc: { name: 'MEXC', color: 'text-green-600' }
  };

  // 准备表格数据
  const tableData: TableRow[] = useMemo(() => {
    const rawRows: RawRow[] = latestData.data
      .filter(item => item.amount === amount)
      .filter(item => isSourceEnabled(item.dataSource, sources))
      .map(item => {
        const source = item.dataSource || 'kyberswap';
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
  }, [latestData, amount]);

  const formatRouteBlocks = (route: any): string[] => {
    if (!route) return [];
    if (route.note) return [route.note];
    if (Array.isArray(route.paths)) {
      const lines: string[] = [];
      route.paths.forEach((path: any[], idx: number) => {
        lines.push(`Path ${idx + 1}`);
        path.forEach((hop: any, hopIdx: number) => {
          const from = hop.tokenIn || '';
          const to = hop.tokenOut || '';
          const pool = hop.pool ? ` (${hop.pool})` : '';
          lines.push(`${hopIdx + 1}. ${from} -> ${to}${pool}`);
        });
      });
      return lines;
    }
    if (Array.isArray(route.swaps)) {
      return [JSON.stringify(route.swaps, null, 2)];
    }
    if (route.raw || route.tx) {
      return [JSON.stringify({ raw: route.raw, tx: route.tx }, null, 2)];
    }
    return [JSON.stringify(route, null, 2)];
  };

  const getToolLabel = (route: any): string | null => {
    if (!route) return null;
    const raw = route.raw || {};
    return raw.tool || raw.toolDetails?.name || null;
  };

  const renderRouteModal = () => {
    if (!activeRoute) return null;
    const aLines = formatRouteBlocks(activeRoute.routeAtoB);
    const bLines = formatRouteBlocks(activeRoute.routeBtoA);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setActiveRoute(null)}>
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <div className="text-sm text-gray-500">Route Details</div>
              <div className="text-lg font-semibold text-gray-900">{activeRoute.chain} · {activeRoute.source}</div>
            </div>
            <button onClick={() => setActiveRoute(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4 text-sm text-gray-700">
            {aLines.length > 0 && (
              <div className="mb-6">
                <div className="font-semibold text-gray-800 mb-2">A → B</div>
                {getToolLabel(activeRoute.routeAtoB) && (
                  <div className="mb-2 text-xs text-gray-500">Tool: {getToolLabel(activeRoute.routeAtoB)}</div>
                )}
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{aLines.join('\n')}</pre>
              </div>
            )}
            {bLines.length > 0 && (
              <div>
                <div className="font-semibold text-gray-800 mb-2">B → A</div>
                {getToolLabel(activeRoute.routeBtoA) && (
                  <div className="mb-2 text-xs text-gray-500">Tool: {getToolLabel(activeRoute.routeBtoA)}</div>
                )}
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{bLines.join('\n')}</pre>
              </div>
            )}
            {aLines.length === 0 && bLines.length === 0 && (
              <div className="text-gray-500">No route info available.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

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
      {renderRouteModal()}
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
              const rowTime = new Date(row.timestamp).toLocaleString('zh-CN');

              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors" title={`Quote time: ${rowTime}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.chain}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => setActiveRoute({ chain: row.chain, source: sourceDisplayInfo.name, routeAtoB: row.routeAtoB, routeBtoA: row.routeBtoA })}
                    >
                      <span className={`font-semibold ${sourceDisplayInfo.color}`}>
                        {sourceDisplayInfo.name}
                      </span>
                      <span className="text-xs text-gray-400">ⓘ</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.outputAtoB !== null ? (
                      <span className="text-gray-700">
                        {row.outputAtoB.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-red-500 text-xs">错误</span>
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
                      <span className="text-red-500 text-xs">错误</span>
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
        价差 (bps) = 相对“全体中位数汇率”的偏差 |
        套利空间 (bps) = ({pair.tokenA}→{pair.tokenB} 汇率 × {pair.tokenB}→{pair.tokenA} 汇率 - 1) × 10000 |
        点击列标题可排序
      </div>
    </div>
  );
}
