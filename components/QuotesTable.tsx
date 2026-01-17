'use client';

import { useMemo, useState } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext'; // To get chain names if needed, though history has chain name
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
    // We need to know Token Names for the header
    // Currently we can't easily get Token Names from `pairId` without the `TradingPair` config.
    // The history item has `tokenAToB` but doesn't explicitly say "USDC". 
    // However, `SwapDataGrid` or parent usually knows.
    // We can try to infer or just use "Token A" / "Token B" if config is missing, 
    // BUT we should probably use the Context to find the pair info.

    // Actually, we can fetch the pair info from Context if we expose tradingPairs.
    // For now let's reuse the logic: "USDC/USDT" is standard.
    // The pairId is like "usdc_usdt". 
    const [tokenA, tokenB] = pairId.split('_').map(s => s.toUpperCase());

    const [sortKey, setSortKey] = useState<SortKey>('chain');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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
                const tokenAToB = item.tokenAToB || item.usdcToUsdt;
                const tokenBToA = item.tokenBToA || item.usdtToUsdc;
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
        binance: { name: 'Binance', color: 'text-yellow-600' },
        bybit: { name: 'Bybit', color: 'text-orange-600' },
        mexc: { name: 'MEXC', color: 'text-green-600' }
    };

    const shortAddr = (addr?: string) => {
        if (!addr || typeof addr !== 'string') return '';
        if (!addr.startsWith('0x') || addr.length < 12) return addr;
        return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    };

    const formatRouteLines = (route: any): string[] => {
        if (!route) return [];
        if (typeof route === 'string') return [route];
        if (route.note) return [route.note];
        if (Array.isArray(route.paths)) {
            const lines: string[] = [];
            route.paths.forEach((path: any[], idx: number) => {
                lines.push(`Path ${idx + 1}`);
                path.forEach((hop: any, hopIdx: number) => {
                    const from = shortAddr(hop.tokenIn);
                    const to = shortAddr(hop.tokenOut);
                    const pool = hop.pool ? ` (${hop.pool})` : '';
                    lines.push(`${hopIdx + 1}. ${from} → ${to}${pool}`);
                });
            });
            return lines;
        }
        return ['Route info unavailable'];
    };

    const renderRouteTooltip = (routeA: any, routeB: any) => {
        const aLines = formatRouteLines(routeA);
        const bLines = formatRouteLines(routeB);
        if (aLines.length === 0 && bLines.length === 0) return null;

        return (
            <div className="absolute left-1/2 top-full z-20 mt-2 w-[320px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-xl hidden group-hover:block">
                <div className="font-semibold text-gray-900 mb-1">Route Info</div>
                {aLines.length > 0 && (
                    <div className="mb-2">
                        <div className="font-medium text-gray-600 mb-1">A → B</div>
                        {aLines.map((line, idx) => (
                            <div key={`a-${idx}`} className="whitespace-pre-wrap">{line}</div>
                        ))}
                    </div>
                )}
                {bLines.length > 0 && (
                    <div>
                        <div className="font-medium text-gray-600 mb-1">B → A</div>
                        {bLines.map((line, idx) => (
                            <div key={`b-${idx}`} className="whitespace-pre-wrap">{line}</div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
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
                                        <span className="relative group inline-flex">
                                            <span className={`font-semibold ${src.color}`}>{src.name}</span>
                                            {renderRouteTooltip(row.routeAtoB, row.routeBtoA)}
                                        </span>
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
