'use client';

import { useMemo, useState } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
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
    routeAtoB?: any;
    routeBtoA?: any;
}

export default function QuotesTable({ history, amount, pairId }: QuotesTableProps) {
    const { pairs } = useConfig();
    const pair = pairs[pairId];
    const [fallbackA, fallbackB] = pairId.split('_');
    const tokenA = pair?.tokenA || fallbackA || 'TokenA';
    const tokenB = pair?.tokenB || fallbackB || 'TokenB';

    const [sortKey, setSortKey] = useState<SortKey>('chain');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [activeRoute, setActiveRoute] = useState<{
        chain: string;
        source: string;
        routeAtoB?: any;
        routeBtoA?: any;
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
            .map(item => {
                const source = item.dataSource || 'kyberswap';
                const tokenAToB = item.tokenAToB;
                const tokenBToA = item.tokenBToA;
                return {
                    chain: item.chain,
                    dataSource: source,
                    outputAtoB: tokenAToB?.output ?? null,
                    outputBtoA: tokenBToA?.output ?? null,
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

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            {renderRouteModal()}
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
                            return (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-gray-900">{row.chain}</td>
                                    <td className="px-4 py-3">
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1"
                                            onClick={() => setActiveRoute({ chain: row.chain, source: src.name, routeAtoB: row.routeAtoB, routeBtoA: row.routeBtoA })}
                                        >
                                            <span className={`font-semibold ${src.color}`}>{src.name}</span>
                                            <span className="text-xs text-gray-400">ⓘ</span>
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {row.outputAtoB !== null ? row.outputAtoB.toFixed(4) : <span className="text-red-400">N/A</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {row.outputBtoA !== null ? row.outputBtoA.toFixed(4) : <span className="text-red-400">N/A</span>}
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
