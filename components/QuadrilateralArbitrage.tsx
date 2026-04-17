'use client';

import { useMemo } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import { isSourceEnabled, getPairCategory, PairCategory } from '@/lib/utils';

interface QuadrilateralArbitrageProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId?: string;
}

// Quadrilateral arb: 4-hop cycle A → B → C → D → A
// The key use-case for ETH LSTs (all pairs are X/ETH):
//   ETH → wstETH(chainA) → ETH(chainB) → weETH(chainB) → ETH(chainA)
// Here C === A (hub-spoke with ETH as the hub), allowing the intermediate
// token (ETH) to be revisited. This finds cross-chain multi-LST opportunities
// that 3-hop triangular arb cannot detect.

interface QuadOpp {
    path: string;
    profitBps: number;
    isCrossChain: boolean;
    startAmount: number;
    steps: {
        from: string;
        to: string;
        chain: string;
        source: string;
        rate: number;
        quotedInput: number;
    }[];
}

export default function QuadrilateralArbitrage({ history, amount, pairId }: QuadrilateralArbitrageProps) {
    const { pairs, sources } = useConfig();

    const currentCategory = useMemo((): PairCategory => {
        const p = pairId ? pairs[pairId] : null;
        return p ? getPairCategory(p.tokenA, p.tokenB) : 'stable';
    }, [pairId, pairs]);

    const pairsByLower = useMemo(() => {
        const map = new Map<string, { tokenA: string; tokenB: string }>();
        Object.entries(pairs).forEach(([id, pair]) => {
            map.set(id.toLowerCase(), { tokenA: pair.tokenA, tokenB: pair.tokenB });
        });
        return map;
    }, [pairs]);

    const opportunities = useMemo(() => {
        if (history.length === 0) return [];

        const latestTime = history[history.length - 1].timestamp;
        const timeThreshold = new Date(latestTime).getTime() - 5 * 60 * 1000;

        // Use all recent data regardless of amount (rates are normalised).
        const recentData = history
            .filter(h => new Date(h.timestamp).getTime() > timeThreshold)
            .flatMap(h => h.data)
            .filter(d => d.tokenAToB || d.tokenBToA)
            .filter(d => isSourceEnabled(d.dataSource, sources));

        // Build graph: token -> token -> Edge[]
        interface Edge {
            to: string;
            chain: string;
            source: string;
            rate: number;
            quotedInput: number;
        }
        const graph: Record<string, Record<string, Edge[]>> = {};

        function addEdge(from: string, to: string, rate: number, chain: string, source: string, quotedInput: number) {
            if (!graph[from]) graph[from] = {};
            if (!graph[from][to]) graph[from][to] = [];
            graph[from][to].push({ to, rate, chain, source, quotedInput });
        }

        recentData.forEach(item => {
            if (!item.pairId) return;
            const pair = pairs[item.pairId] || pairsByLower.get(item.pairId.toLowerCase());
            const [fallbackA, fallbackB] = item.pairId.split('_');
            const tA = pair?.tokenA || fallbackA || 'TokenA';
            const tB = pair?.tokenB || fallbackB || 'TokenB';

            const tokenAToB = item.tokenAToB;
            const tokenBToA = item.tokenBToA;

            // Same sanity check as triangular arb: skip obviously wrong data
            if (tokenAToB?.output && tokenAToB.output > 0 && tokenBToA?.output && tokenBToA.output > 0) {
                const rateAtoB = tokenAToB.output / (tokenAToB.input > 0 ? tokenAToB.input : 1);
                const rateBtoA = tokenBToA.output / (tokenBToA.input > 0 ? tokenBToA.input : 1);
                const product = rateAtoB * rateBtoA;
                if ((product - 1) * 10000 > 0.1) return;
                if (product < 0.9) return;
            }

            if (tokenAToB?.output && tokenAToB.output > 0) {
                addEdge(tA, tB, tokenAToB.output / tokenAToB.input, item.chain, item.dataSource || 'unknown', tokenAToB.input);
            }
            if (tokenBToA?.output && tokenBToA.output > 0) {
                addEdge(tB, tA, tokenBToA.output / tokenBToA.input, item.chain, item.dataSource || 'unknown', tokenBToA.input);
            }
        });

        // 4-hop cycle search: T0 → T1 → T2 → T3 → T0
        // Rules:
        //   - T1 ≠ T0 (no self-loop)
        //   - T2 ≠ T1 (no immediate backtrack)
        //   - T2 may equal T0 (hub-spoke: allows ETH→LST→ETH→LST→ETH)
        //   - T3 ≠ T2 (no immediate backtrack)
        //   - T3 ≠ T0 (otherwise reduces to 3-hop already covered by triangular arb)
        //   - T3 ≠ T1 when T2 === T0 (avoids degenerate T0→T1→T0→T1→T0)
        //   - graph[T3][T0] must exist (closing edge)
        //   - At most 3 distinct chains across the 4 legs

        const opps: QuadOpp[] = [];
        const tokens = Object.keys(graph);

        for (const T0 of tokens) {
            if (!graph[T0]) continue;
            for (const T1 of Object.keys(graph[T0])) {
                if (T1 === T0) continue;
                if (!graph[T1]) continue;
                for (const T2 of Object.keys(graph[T1])) {
                    if (T2 === T1) continue;
                    if (!graph[T2]) continue;
                    for (const T3 of Object.keys(graph[T2])) {
                        if (T3 === T2) continue;
                        if (T3 === T0) continue; // would be 3-hop
                        if (T2 === T0 && T3 === T1) continue; // degenerate
                        if (!graph[T3] || !graph[T3][T0]) continue;

                        const e1List = graph[T0][T1];
                        const e2List = graph[T1][T2];
                        const e3List = graph[T2][T3];
                        const e4List = graph[T3][T0];

                        let best: QuadOpp | null = null;

                        for (const e1 of e1List) {
                            for (const e2 of e2List) {
                                for (const e3 of e3List) {
                                    for (const e4 of e4List) {
                                        const chains = new Set([e1.chain, e2.chain, e3.chain, e4.chain]);
                                        if (chains.size > 2) continue;
                                        const totalRate = e1.rate * e2.rate * e3.rate * e4.rate;
                                        const profitBps = (totalRate - 1) * 10000;
                                        if (profitBps > 0 && (!best || profitBps > best.profitBps)) {
                                            best = {
                                                profitBps,
                                                isCrossChain: chains.size > 1,
                                                startAmount: e1.quotedInput,
                                                path: `${T0} → ${T1} → ${T2} → ${T3} → ${T0}`,
                                                steps: [
                                                    { from: T0, to: T1, chain: e1.chain, source: e1.source, rate: e1.rate, quotedInput: e1.quotedInput },
                                                    { from: T1, to: T2, chain: e2.chain, source: e2.source, rate: e2.rate, quotedInput: e2.quotedInput },
                                                    { from: T2, to: T3, chain: e3.chain, source: e3.source, rate: e3.rate, quotedInput: e3.quotedInput },
                                                    { from: T3, to: T0, chain: e4.chain, source: e4.source, rate: e4.rate, quotedInput: e4.quotedInput },
                                                ]
                                            };
                                        }
                                    }
                                }
                            }
                        }
                        if (best) opps.push(best);
                    }
                }
            }
        }

        // Deduplicate rotated/reversed cycles: canonical key = sorted token path
        // For hub-spoke (T2===T0): key includes duplicated hub, so [ETH,wstETH,ETH,weETH]
        // is distinct from [ETH,weETH,ETH,wstETH] in profit but same token set.
        const seen = new Map<string, QuadOpp>();
        for (const opp of opps) {
            const tokens4 = [opp.steps[0].from, opp.steps[1].from, opp.steps[2].from, opp.steps[3].from];
            // Canonical rotation: find the rotation starting with the lexicographically smallest token
            let minRot = tokens4.join('|');
            for (let i = 1; i < 4; i++) {
                const rot = [...tokens4.slice(i), ...tokens4.slice(0, i)].join('|');
                if (rot < minRot) minRot = rot;
            }
            const existing = seen.get(minRot);
            if (!existing || opp.profitBps > existing.profitBps) {
                seen.set(minRot, opp);
            }
        }

        return [...seen.values()].sort((a, b) => b.profitBps - a.profitBps);
    }, [history, amount, pairs, pairsByLower, sources]);

    // Sort: same-category first, same-chain before cross-chain, then by profit
    const sortedOpportunities = useMemo(() => {
        return [...opportunities].sort((a, b) => {
            const catA = getPairCategory(a.steps[0].from, a.steps[0].to);
            const catB = getPairCategory(b.steps[0].from, b.steps[0].to);
            const matchA = catA === currentCategory ? 0 : 1;
            const matchB = catB === currentCategory ? 0 : 1;
            if (matchA !== matchB) return matchA - matchB;
            if (a.isCrossChain !== b.isCrossChain) return a.isCrossChain ? 1 : -1;
            return b.profitBps - a.profitBps;
        });
    }, [opportunities, currentCategory]);

    if (sortedOpportunities.length === 0) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500">
                No Quadrilateral opportunities found for amount {amount.toLocaleString()} (Requires A→B→C→D→A paths, including hub-spoke ETH→LST→ETH→LST→ETH).
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Quadrilateral Arbitrage
                <span className="ml-2 text-sm font-normal text-gray-400">Amount: {amount.toLocaleString()}</span>
            </h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left">Path</th>
                            <th className="px-4 py-2 text-right">Profit</th>
                            <th className="px-4 py-2 text-left">Steps</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sortedOpportunities.slice(0, 15).map((opp, idx) => {
                            const runningAmounts: number[] = [opp.startAmount];
                            for (const step of opp.steps) {
                                runningAmounts.push(runningAmounts[runningAmounts.length - 1] * step.rate);
                            }
                            const profitAmt = runningAmounts[4] - runningAmounts[0];
                            const fmt = (n: number) => n >= 1000
                                ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
                                : n.toFixed(4);
                            return (
                                <tr key={idx} className={opp.isCrossChain ? 'bg-yellow-50/40' : ''}>
                                    <td className="px-4 py-3 font-medium">
                                        <div>{opp.path}</div>
                                        {opp.isCrossChain && (
                                            <span className="text-xs font-normal text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">cross-chain</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="font-bold text-green-600">+{opp.profitBps.toFixed(4)} bps</div>
                                        <div className="text-xs text-green-700">+{fmt(profitAmt)} {opp.steps[0].from}</div>
                                        <div className="text-xs text-gray-400">on {fmt(opp.startAmount)} {opp.steps[0].from}</div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                                        {opp.steps.map((s, i) => (
                                            <div key={i} className="leading-5">
                                                {fmt(runningAmounts[i])} {s.from}
                                                {' → '}
                                                <span className="text-gray-800 font-semibold">{fmt(runningAmounts[i + 1])} {s.to}</span>
                                                {' '}
                                                <span className="text-gray-400">({s.chain}, {s.source}, quoted@{fmt(s.quotedInput)})</span>
                                            </div>
                                        ))}
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
