'use client';

import { useMemo, useState } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import RouteDetailsModal from '@/components/RouteDetailsModal';
import { extractLiFiAlternatives } from '@/lib/lifi-route';
import { getSourceInfo } from '@/lib/source-metadata';
import { RouteInfo } from '@/lib/types';
import { isSourceEnabled } from '@/lib/utils';

interface QuotesTableProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId: string;
}

type SortKey = 'chain' | 'dataSource' | 'rateAtoB' | 'rateBtoA' | 'roundtripBps';
type SortDirection = 'asc' | 'desc';

interface TableRow {
    chain: string;
    dataSource: string;
    outputAtoB: number | null;
    outputBtoA: number | null;
    rateAtoB: number | null;
    rateBtoA: number | null;
    devAtoBBps: number | null;
    devBtoABps: number | null;
    roundtripBps: number | null;
    timestamp: string;
    routeAtoB?: RouteInfo;
    routeBtoA?: RouteInfo;
}

const SortIcon = ({ columnKey, sortKey, sortDirection }: { columnKey: SortKey; sortKey: SortKey; sortDirection: SortDirection }) => {
    if (sortKey !== columnKey) return <span className="text-gray-300 ml-1">⇅</span>;
    return <span className="text-blue-500 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
};

function BpsTag({ bps }: { bps: number | null }) {
    if (bps === null) return <span className="text-gray-300">—</span>;
    const positive = bps >= 0;
    return (
        <span className={`text-[10px] tabular-nums font-medium ${positive ? 'text-emerald-600' : 'text-rose-500'}`}>
            {positive ? '+' : ''}{bps.toFixed(2)} bps
        </span>
    );
}

export default function QuotesTable({ history, amount, pairId }: QuotesTableProps) {
    const { pairs, sources } = useConfig();
    const pair = pairs[pairId];
    const [fallbackA, fallbackB] = pairId.split('_');
    const tokenA = pair?.tokenA || fallbackA || 'TokenA';
    const tokenB = pair?.tokenB || fallbackB || 'TokenB';

    const [sortKey, setSortKey] = useState<SortKey>('rateAtoB');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [activeRoute, setActiveRoute] = useState<{
        chain: string;
        source: string;
        routeAtoB?: RouteInfo;
        routeBtoA?: RouteInfo;
    } | null>(null);

    if (history.length === 0) return null;

    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const recentHistory = history.filter(point => {
        const pointTime = new Date(point.timestamp).getTime();
        return now - pointTime <= windowMs;
    });

    const latestData = recentHistory.length > 0
        ? recentHistory[recentHistory.length - 1]
        : history[history.length - 1];

    const tableData: TableRow[] = useMemo(() => {
        return latestData.data
            .filter(item => item.amount === amount)
            .filter(item => isSourceEnabled(item.dataSource, sources))
            .map(item => {
                const source = item.dataSource || 'kyberswap';
                const tokenAToB = item.tokenAToB;
                const tokenBToA = item.tokenBToA;
                const outputAtoB = tokenAToB?.output ?? null;
                const outputBtoA = tokenBToA?.output ?? null;
                const inputAtoB = tokenAToB?.input ?? amount;
                const inputBtoA = tokenBToA?.input ?? amount;
                const rateAtoB = outputAtoB !== null && inputAtoB > 0 ? outputAtoB / inputAtoB : null;
                const rateBtoA = outputBtoA !== null && inputBtoA > 0 ? outputBtoA / inputBtoA : null;
                const devAtoBBps = rateAtoB !== null ? (rateAtoB - 1) * 10000 : null;
                const devBtoABps = rateBtoA !== null ? (rateBtoA - 1) * 10000 : null;
                const roundtripBps = rateAtoB !== null && rateBtoA !== null
                    ? (rateAtoB * rateBtoA - 1) * 10000
                    : null;
                return {
                    chain: item.chain,
                    dataSource: source,
                    outputAtoB,
                    outputBtoA,
                    rateAtoB,
                    rateBtoA,
                    devAtoBBps,
                    devBtoABps,
                    roundtripBps,
                    timestamp: item.quoteTimestamp || latestData.timestamp,
                    routeAtoB: tokenAToB?.route,
                    routeBtoA: tokenBToA?.route,
                };
            });
    }, [latestData, amount, sources]);

    const bestRateAtoB = useMemo(() => {
        const vals = tableData.map(r => r.rateAtoB).filter((v): v is number => v !== null);
        return vals.length > 0 ? Math.max(...vals) : null;
    }, [tableData]);

    const bestRateBtoA = useMemo(() => {
        const vals = tableData.map(r => r.rateBtoA).filter((v): v is number => v !== null);
        return vals.length > 0 ? Math.max(...vals) : null;
    }, [tableData]);

    const bestRoundtrip = useMemo(() => {
        const vals = tableData.map(r => r.roundtripBps).filter((v): v is number => v !== null);
        return vals.length > 0 ? Math.max(...vals) : null;
    }, [tableData]);

    const sortedData = useMemo(() => {
        const data = [...tableData];
        data.sort((a, b) => {
            let aVal: string | number | null = a[sortKey] as string | number | null;
            let bVal: string | number | null = b[sortKey] as string | number | null;
            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortDirection === 'asc'
                ? (aVal as number) - (bVal as number)
                : (bVal as number) - (aVal as number);
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

    const headerCell = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
        <th
            className={`px-3 py-2 text-${align} text-[11px] font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 hover:bg-gray-100/80 transition-colors select-none whitespace-nowrap`}
            onClick={() => handleSort(key)}
        >
            {label}<SortIcon columnKey={key} sortKey={sortKey} sortDirection={sortDirection} />
        </th>
    );

    const latestTimestamp = new Date(latestData.timestamp);
    const timeStr = latestTimestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = latestTimestamp.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 overflow-hidden">
            <RouteDetailsModal
                activeRoute={activeRoute}
                onClose={() => setActiveRoute(null)}
                tokenA={tokenA}
                tokenB={tokenB}
            />

            {/* Table header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-gray-800">Quotes</h2>
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-md px-2 py-0.5 tabular-nums">
                        {amount.toLocaleString()} {tokenA}
                    </span>
                    <span className="text-xs text-gray-400">
                        {sortedData.filter(r => r.rateAtoB !== null || r.rateBtoA !== null).length} sources
                    </span>
                </div>
                <div className="text-xs text-gray-400 tabular-nums">
                    {dateStr} {timeStr}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-gray-50/40 border-b border-gray-100">
                        <tr>
                            <th
                                className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 hover:bg-gray-100/80 transition-colors select-none"
                                onClick={() => handleSort('chain')}
                            >
                                Chain<SortIcon columnKey="chain" sortKey={sortKey} sortDirection={sortDirection} />
                            </th>
                            <th
                                className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 hover:bg-gray-100/80 transition-colors select-none"
                                onClick={() => handleSort('dataSource')}
                            >
                                Source<SortIcon columnKey="dataSource" sortKey={sortKey} sortDirection={sortDirection} />
                            </th>
                            {headerCell('rateAtoB', `${tokenA}→${tokenB}`)}
                            {headerCell('rateBtoA', `${tokenB}→${tokenA}`)}
                            {headerCell('roundtripBps', 'Roundtrip')}
                            <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                                Quoted At
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {sortedData.map((row, idx) => {
                            const src = getSourceInfo(row.dataSource);
                            const isBestAtoB = bestRateAtoB !== null && row.rateAtoB === bestRateAtoB;
                            const isBestBtoA = bestRateBtoA !== null && row.rateBtoA === bestRateBtoA;
                            const isBestRoundtrip = bestRoundtrip !== null && row.roundtripBps === bestRoundtrip && bestRoundtrip > 0;
                            const lifiRouteCounts = row.dataSource === 'lifi'
                                ? {
                                    aToB: extractLiFiAlternatives(row.routeAtoB).length,
                                    bToA: extractLiFiAlternatives(row.routeBtoA).length,
                                }
                                : null;
                            const rowTime = new Date(row.timestamp);
                            const rowTimeStr = rowTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            return (
                                <tr key={idx} className="hover:bg-blue-50/20 transition-colors group">
                                    {/* Chain */}
                                    <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                                        {row.chain}
                                    </td>

                                    {/* Source */}
                                    <td className="px-3 py-2">
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1.5 group/btn"
                                            onClick={() => setActiveRoute({ chain: row.chain, source: src.name, routeAtoB: row.routeAtoB, routeBtoA: row.routeBtoA })}
                                        >
                                            <span className={`font-semibold ${src.color} group-hover/btn:underline`}>{src.name}</span>
                                            {lifiRouteCounts && (lifiRouteCounts.aToB > 0 || lifiRouteCounts.bToA > 0) && (
                                                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
                                                    {lifiRouteCounts.aToB}/{lifiRouteCounts.bToA}
                                                </span>
                                            )}
                                            <span className="text-gray-300 group-hover/btn:text-gray-500 text-[10px]">ⓘ</span>
                                        </button>
                                    </td>

                                    {/* A→B rate */}
                                    <td className={`px-3 py-2 text-right tabular-nums transition-colors ${isBestAtoB ? 'bg-emerald-50/60' : ''}`}>
                                        {row.rateAtoB !== null ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className={`font-mono font-semibold text-gray-900 ${isBestAtoB ? 'text-emerald-700' : ''}`}>
                                                    {row.rateAtoB.toFixed(6)}
                                                </span>
                                                <BpsTag bps={row.devAtoBBps} />
                                            </div>
                                        ) : (
                                            <span className="text-rose-400 text-[11px]">N/A</span>
                                        )}
                                    </td>

                                    {/* B→A rate */}
                                    <td className={`px-3 py-2 text-right tabular-nums transition-colors ${isBestBtoA ? 'bg-emerald-50/60' : ''}`}>
                                        {row.rateBtoA !== null ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className={`font-mono font-semibold text-gray-900 ${isBestBtoA ? 'text-emerald-700' : ''}`}>
                                                    {row.rateBtoA.toFixed(6)}
                                                </span>
                                                <BpsTag bps={row.devBtoABps} />
                                            </div>
                                        ) : (
                                            <span className="text-rose-400 text-[11px]">N/A</span>
                                        )}
                                    </td>

                                    {/* Roundtrip bps */}
                                    <td className={`px-3 py-2 text-right tabular-nums ${isBestRoundtrip ? 'bg-emerald-50/60' : ''}`}>
                                        {row.roundtripBps !== null ? (
                                            <span className={`font-mono font-semibold text-xs ${
                                                row.roundtripBps > 5 ? 'text-emerald-600' :
                                                row.roundtripBps > 0 ? 'text-emerald-500' :
                                                row.roundtripBps > -10 ? 'text-gray-500' :
                                                'text-rose-500'
                                            }`}>
                                                {row.roundtripBps >= 0 ? '+' : ''}{row.roundtripBps.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-gray-200">—</span>
                                        )}
                                    </td>

                                    {/* Quoted At */}
                                    <td className="px-3 py-2 text-right tabular-nums text-gray-400 whitespace-nowrap">
                                        {rowTimeStr}
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
