'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import { isSourceEnabled, getOneWay } from '@/lib/utils';

interface GlobalRoundTripArbitrageProps {
    history: HistoryDataPoint[];
}

interface GlobalOpp {
    pairId: string;
    pairName: string;
    tokenA: string;
    tokenB: string;
    sellChain: string;
    sellSource: string;
    buyChain: string;
    buySource: string;
    profitBps: number;
    profitAmount: number; // in tokenA units, based on the quoted input
    amount: number;       // quoted input (tokenA units)
}

const PAGE_SIZE = 30;
const TOP_PER_PAIR = 5;

function formatProfit(value: number): string {
    if (!Number.isFinite(value)) return 'N/A';
    return Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(4);
}

export default function GlobalRoundTripArbitrage({ history }: GlobalRoundTripArbitrageProps) {
    const { pairs, sources } = useConfig();
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    const opportunities = useMemo((): GlobalOpp[] => {
        if (history.length === 0) return [];

        // Freshest row per (pair, chain, source, amount) within the last 5 minutes
        const latestTime = new Date(history[history.length - 1].timestamp).getTime();
        const threshold = latestTime - 5 * 60 * 1000;
        const freshest = new Map<string, { pairId: string; row: HistoryDataPoint['data'][number] }>();
        for (let i = history.length - 1; i >= 0; i--) {
            const pt = history[i];
            if (new Date(pt.timestamp).getTime() < threshold) break;
            for (const row of pt.data) {
                if (!row.pairId) continue;
                if (!isSourceEnabled(row.dataSource, sources)) continue;
                const key = `${row.pairId}|${row.chainKey}|${row.dataSource}|${row.amount}`;
                if (!freshest.has(key)) freshest.set(key, { pairId: row.pairId, row });
            }
        }

        // Group rows by pair
        const byPair = new Map<string, HistoryDataPoint['data'][number][]>();
        for (const { pairId, row } of freshest.values()) {
            let list = byPair.get(pairId);
            if (!list) byPair.set(pairId, list = []);
            list.push(row);
        }

        const all: GlobalOpp[] = [];
        for (const [pairId, rows] of byPair) {
            const pair = pairs[pairId];
            const [fallbackA, fallbackB] = pairId.split('_');
            const tokenA = pair?.tokenA || fallbackA || 'TokenA';
            const tokenB = pair?.tokenB || fallbackB || 'TokenB';
            const pairName = pair?.name || `${tokenA}/${tokenB}`;

            // Same sanity rule as the per-pair view: two-way rows with a
            // >0.1bps same-source roundtrip are bad data; one-way rows pass.
            const valid = rows.filter(d => {
                const outA = d.tokenAToB?.output;
                const outB = d.tokenBToA?.output;
                if (!outA && !outB) return false;
                if (!outA || !outB) return true;
                const rA = outA / (d.tokenAToB!.input > 0 ? d.tokenAToB!.input : 1);
                const rB = outB / (d.tokenBToA!.input > 0 ? d.tokenBToA!.input : 1);
                if (!isFinite(rA) || !isFinite(rB) || rA <= 0 || rB <= 0) return false;
                const product = rA * rB;
                return (product - 1) * 10000 <= 0.1 && product >= 0.9;
            });

            const sells = valid
                .filter(d => getOneWay(pair, d.chainKey) !== 'BtoA')
                .filter(d => d.tokenAToB?.output && d.tokenAToB.output > 0)
                .map(d => ({
                    chain: d.chain,
                    source: d.dataSource || 'unknown',
                    input: d.tokenAToB!.input,
                    rate: d.tokenAToB!.output! / d.tokenAToB!.input,
                }))
                .filter(s => isFinite(s.rate) && s.rate > 0);
            const buys = valid
                .filter(d => getOneWay(pair, d.chainKey) !== 'AtoB')
                .filter(d => d.tokenBToA?.output && d.tokenBToA.output > 0)
                .map(d => ({
                    chain: d.chain,
                    source: d.dataSource || 'unknown',
                    rate: d.tokenBToA!.output! / d.tokenBToA!.input,
                }))
                .filter(b => isFinite(b.rate) && b.rate > 0);

            const pairOpps: GlobalOpp[] = [];
            for (const sell of sells) {
                for (const buy of buys) {
                    const profitBps = (sell.rate * buy.rate - 1) * 10000;
                    if (!isFinite(profitBps) || profitBps <= 0 || profitBps > 2000) continue;
                    pairOpps.push({
                        pairId,
                        pairName,
                        tokenA,
                        tokenB,
                        sellChain: sell.chain,
                        sellSource: sell.source,
                        buyChain: buy.chain,
                        buySource: buy.source,
                        profitBps,
                        profitAmount: sell.input * profitBps / 10000,
                        amount: sell.input,
                    });
                }
            }
            pairOpps.sort((a, b) => b.profitBps - a.profitBps);
            all.push(...pairOpps.slice(0, TOP_PER_PAIR));
        }

        return all.sort((a, b) => b.profitBps - a.profitBps);
    }, [history, pairs, sources]);

    // Reset paging when the data set changes materially
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [opportunities.length]);

    // Auto load-more: grow the visible window when the sentinel scrolls into view
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                setVisibleCount(c => Math.min(c + PAGE_SIZE, opportunities.length));
            }
        }, { rootMargin: '200px' });
        observer.observe(el);
        return () => observer.disconnect();
    }, [opportunities.length]);

    const visible = opportunities.slice(0, visibleCount);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <h2 className="text-sm font-semibold text-gray-800">Global Round Trip Arbitrage</h2>
                {opportunities.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{opportunities.length} opportunities across all pairs</span>
                        <span className="text-emerald-600 font-semibold tabular-nums">
                            best +{opportunities[0].profitBps.toFixed(2)} bps
                        </span>
                    </div>
                )}
            </div>

            {opportunities.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                    No profitable opportunities (&gt;0 bps)
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-gray-50/40 border-b border-gray-100">
                            <tr>
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-6">#</th>
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Pair</th>
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Sell</th>
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buy back</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Profit (bps)</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Est. Profit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {visible.map((opp, idx) => (
                                <tr key={`${opp.pairId}|${opp.sellChain}|${opp.sellSource}|${opp.buyChain}|${opp.buySource}`} className={`hover:bg-blue-50/20 transition-colors ${idx < 3 ? 'bg-emerald-50/20' : ''}`}>
                                    <td className="px-3 py-2 text-gray-400 tabular-nums font-mono text-center">{idx + 1}</td>
                                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{opp.pairName}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="font-medium text-gray-800">
                                            {opp.sellChain}
                                            <span className="ml-1.5 font-mono text-[10px] font-normal text-blue-600">{opp.tokenA}→{opp.tokenB}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400">{opp.sellSource}</div>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="font-medium text-gray-800">
                                            {opp.buyChain}
                                            <span className="ml-1.5 font-mono text-[10px] font-normal text-blue-600">{opp.tokenB}→{opp.tokenA}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400">{opp.buySource}</div>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-mono text-gray-600">
                                        {opp.amount.toLocaleString('en-US')} {opp.tokenA}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        <span className="font-mono font-bold text-emerald-600">+{opp.profitBps.toFixed(4)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        <span className="font-mono text-emerald-700 font-semibold">
                                            +{formatProfit(opp.profitAmount)} {opp.tokenA}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div ref={sentinelRef} className="py-3 text-center text-[11px] text-gray-400">
                        {visibleCount < opportunities.length
                            ? `Loading more… (${visibleCount}/${opportunities.length})`
                            : `All ${opportunities.length} opportunities shown`}
                    </div>
                </div>
            )}
        </div>
    );
}
