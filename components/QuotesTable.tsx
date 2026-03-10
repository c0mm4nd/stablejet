'use client';

import { useMemo, useState } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import RouteDetailsModal from '@/components/RouteDetailsModal';
import { extractLiFiAlternatives } from '@/lib/lifi-route';
import { RouteInfo } from '@/lib/types';
import { isSourceEnabled } from '@/lib/utils';
// import { hydrateTradingPairs } from '@/lib/config'; // If we need to lookup token names from context

interface QuotesTableProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId: string;
}

type SortKey = 'chain' | 'dataSource' | 'outputAtoB' | 'outputBtoA';
type SortDirection = 'asc' | 'desc';

interface TableRow {
    chain: string;
    dataSource: string;
    outputAtoB: number | null;
    outputBtoA: number | null;
    timestamp: string;
    routeAtoB?: RouteInfo;
    routeBtoA?: RouteInfo;
}

export default function QuotesTable({ history, amount, pairId }: QuotesTableProps) {
    const { pairs, sources } = useConfig();
    const pair = pairs[pairId];
    const [fallbackA, fallbackB] = pairId.split('_');
    const tokenA = pair?.tokenA || fallbackA || 'TokenA';
    const tokenB = pair?.tokenB || fallbackB || 'TokenB';

    const [sortKey, setSortKey] = useState<SortKey>('chain');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [activeRoute, setActiveRoute] = useState<{
        chain: string;
        source: string;
        routeAtoB?: RouteInfo;
        routeBtoA?: RouteInfo;
    } | null>(null);

    if (history.length === 0) {
        return null;
    }

    // Get latest data point
    // 只使用最近10分钟的数据点（如果有的话）
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10分钟
    const recentHistory = history.filter(point => {
        const pointTime = new Date(point.timestamp).getTime();
        return now - pointTime <= windowMs;
    });

    const latestData = recentHistory.length > 0
        ? recentHistory[recentHistory.length - 1]
        : history[history.length - 1];

    const timestamp = new Date(latestData.timestamp).toLocaleString('zh-CN');

    // Prepare Data
    const tableData: TableRow[] = useMemo(() => {
        return latestData.data
            .filter(item => item.amount === amount)
            .filter(item => isSourceEnabled(item.dataSource, sources))
            .map(item => {
                const source = item.dataSource || 'kyberswap';
                const tokenAToB = item.tokenAToB;
                const tokenBToA = item.tokenBToA;
                return {
                    chain: item.chain,
                    dataSource: source,
                    outputAtoB: tokenAToB?.output ?? null,
                    outputBtoA: tokenBToA?.output ?? null,
                    timestamp: item.quoteTimestamp || latestData.timestamp,
                    routeAtoB: tokenAToB?.route,
                    routeBtoA: tokenBToA?.route
                };
            });
    }, [latestData, amount]);

    // Sort
    const sortedData = useMemo(() => {
        const data = [...tableData];
        data.sort((a, b) => {
            let aVal: any = a[sortKey];
            let bVal: any = b[sortKey];

            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDirection === 'asc'
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return data;
    }, [tableData, sortKey, sortDirection]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
    };

    const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
        if (sortKey !== columnKey) return <span className="text-gray-400">⇅</span>;
        return <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    const sourceInfo: Record<string, { name: string; color: string }> = {
        kyberswap: { name: 'KyberSwap', color: 'text-blue-600' },
        nordstern: { name: 'Nordstern', color: 'text-cyan-600' },
        lifi: { name: 'Li.Fi', color: 'text-teal-600' },
        binance: { name: 'Binance', color: 'text-yellow-600' },
        bybit: { name: 'Bybit', color: 'text-orange-600' },
        mexc: { name: 'MEXC', color: 'text-green-600' }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <RouteDetailsModal
                activeRoute={activeRoute}
                onClose={() => setActiveRoute(null)}
                tokenA={tokenA}
                tokenB={tokenB}
            />
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                    Quotes ({amount.toLocaleString()} {tokenA})
                </h2>
                <span className="text-sm text-gray-500">
                    Last Updated: {timestamp}
                </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => handleSort('chain')}
                            >
                                <div className="flex items-center gap-2">Chain <SortIcon columnKey="chain" /></div>
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => handleSort('dataSource')}
                            >
                                <div className="flex items-center gap-2">Source <SortIcon columnKey="dataSource" /></div>
                            </th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => handleSort('outputAtoB')}
                            >
                                <div className="flex items-center justify-end gap-2">{tokenA} -&gt; {tokenB} <SortIcon columnKey="outputAtoB" /></div>
                            </th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => handleSort('outputBtoA')}
                            >
                                <div className="flex items-center justify-end gap-2">{tokenB} -&gt; {tokenA} <SortIcon columnKey="outputBtoA" /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sortedData.map((row, idx) => {
                            const src = sourceInfo[row.dataSource] || { name: row.dataSource, color: 'text-gray-600' };
                            const rowTime = new Date(row.timestamp).toLocaleString('zh-CN');
                            const lifiRouteCount = row.dataSource === 'lifi'
                                ? Math.max(extractLiFiAlternatives(row.routeAtoB).length, extractLiFiAlternatives(row.routeBtoA).length)
                                : 0;
                            return (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors" title={`Quote time: ${rowTime}`}>
                                    <td className="px-4 py-3 font-medium text-gray-900">{row.chain}</td>
                                    <td className="px-4 py-3">
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-2"
                                            onClick={() => setActiveRoute({ chain: row.chain, source: src.name, routeAtoB: row.routeAtoB, routeBtoA: row.routeBtoA })}
                                        >
                                            <span className={`font-semibold ${src.color}`}>{src.name}</span>
                                            {lifiRouteCount > 0 && (
                                                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                                                    {lifiRouteCount} quotes
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-400">ⓘ</span>
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {row.outputAtoB !== null ? row.outputAtoB.toFixed(6) : <span className="text-red-400">N/A</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {row.outputBtoA !== null ? row.outputBtoA.toFixed(6) : <span className="text-red-400">N/A</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
