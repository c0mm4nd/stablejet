'use client';

import { useMemo } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import { isSourceEnabled, getPairCategory, PairCategory } from '@/lib/utils';

interface TriangularArbitrageProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId?: string;
}

// Triangular Arb needs 3 tokens: A -> B -> C -> A.
// This requires quotes from multiple configured pairs (A/B, B/C, C/A),
// possibly across different chains. The dashboard switches to fetching
// history without the pair filter when Triangular mode is active.

interface TriangularOpp {
    path: string;
    profitBps: number;
    steps: {
        from: string;
        to: string;
        chain: string;
        source: string;
        rate: number;
    }[];
}

export default function TriangularArbitrage({ history, amount, pairId }: TriangularArbitrageProps) {
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
    // We process the Latest snapshot across ALL pairs.
    // Assumption: `history` contains data for multiple pairs if we changed the fetcher.
    // If `history` only has 1 pair, this returns empty.

    const opportunities = useMemo(() => {
        if (history.length === 0) return [];

        // Get latest snapshot per Pair?
        // History is time-series. We want the latest "State of the World".
        // 1. Group latest data by PairId.
        const latestTime = history[history.length - 1].timestamp;
        const timeThreshold = new Date(latestTime).getTime() - 5 * 60 * 1000; // Within 5 minutes of latest

        // Flatten all recent data points
        const recentData = history
            .filter(h => new Date(h.timestamp).getTime() > timeThreshold)
            .flatMap(h => h.data)
            .filter(d => d.tokenAToB || d.tokenBToA)
            .filter(d => isSourceEnabled(d.dataSource, sources));

        // Build a Graph: Token -> Token -> List of Quotes (Edges)
        // Edge: { chain, source, rate }
        interface Edge {
            to: string;
            chain: string;
            source: string;
            rate: number;
        }
        const graph: Record<string, Record<string, Edge[]>> = {};

        function addEdge(from: string, to: string, rate: number, chain: string, source: string) {
            if (!graph[from]) graph[from] = {};
            if (!graph[from][to]) graph[from][to] = [];
            graph[from][to].push({ to, rate, chain, source });
        }

        recentData.forEach(item => {
            // Need Token Names from pairId?
            // item.pairId is required. If missing, we can't link.
            if (!item.pairId) return;
            const pair = pairs[item.pairId] || pairsByLower.get(item.pairId.toLowerCase());
            const [fallbackA, fallbackB] = item.pairId.split('_');
            const tA = pair?.tokenA || fallbackA || 'TokenA';
            const tB = pair?.tokenB || fallbackB || 'TokenB';

            const tokenAToB = item.tokenAToB;
            const tokenBToA = item.tokenBToA;

            // Exclude data points where same-chain round-trip profit > 0.1 bps —
            // these indicate spurious quotes (pool imbalance, stale data, etc.)
            // and would artificially inflate triangular profit calculations.
            if (tokenAToB?.output && tokenAToB.output > 0 && tokenBToA?.output && tokenBToA.output > 0) {
                const inputAtoB = tokenAToB.input > 0 ? tokenAToB.input : 1;
                const inputBtoA = tokenBToA.input > 0 ? tokenBToA.input : 1;
                const rateAtoB = tokenAToB.output / inputAtoB;
                const rateBtoA = tokenBToA.output / inputBtoA;
                if ((rateAtoB * rateBtoA - 1) * 10000 > 0.1) return;
            }

            // A -> B
            if (tokenAToB?.output && tokenAToB.output > 0) {
                const rate = tokenAToB.output / tokenAToB.input;
                addEdge(tA, tB, rate, item.chain, item.dataSource || 'kyberswap');
            }
            // B -> A
            if (tokenBToA?.output && tokenBToA.output > 0) {
                const rate = tokenBToA.output / tokenBToA.input;
                addEdge(tB, tA, rate, item.chain, item.dataSource || 'kyberswap');
            }
        });

        // Find Cycles A->B->C->A
        const opps: TriangularOpp[] = [];
        const tokens = Object.keys(graph);

        // BFS/DFS limited depth 3
        for (const startToken of tokens) {
            if (!graph[startToken]) continue;

            for (const [secondToken, firstEdges] of Object.entries(graph[startToken])) {
                if (secondToken === startToken) continue;
                if (!graph[secondToken]) continue;

                for (const [thirdToken, secondEdges] of Object.entries(graph[secondToken])) {
                    if (thirdToken === startToken || thirdToken === secondToken) continue;
                    if (!graph[thirdToken]) continue;

                    // Check for edge back to start (C -> A)
                    if (graph[thirdToken][startToken]) {
                        const thirdEdges = graph[thirdToken][startToken];

                        // We have A->B, B->C, C->A.
                        // Only consider combinations where all 3 legs use at most 2 distinct chains
                        // (pure same-chain or one cross-chain hop — both are executable).
                        let best: TriangularOpp | null = null;
                        for (const e1 of firstEdges) {
                            for (const e2 of secondEdges) {
                                for (const e3 of thirdEdges) {
                                    const chains = new Set([e1.chain, e2.chain, e3.chain]);
                                    if (chains.size > 2) continue;
                                    const totalRate = e1.rate * e2.rate * e3.rate;
                                    const profitBps = (totalRate - 1) * 10000;
                                    if (profitBps > 0 && (!best || profitBps > best.profitBps)) {
                                        best = {
                                            profitBps,
                                            path: `${startToken} → ${secondToken} → ${thirdToken} → ${startToken}`,
                                            steps: [
                                                { from: startToken, to: secondToken, chain: e1.chain, source: e1.source, rate: e1.rate },
                                                { from: secondToken, to: thirdToken, chain: e2.chain, source: e2.source, rate: e2.rate },
                                                { from: thirdToken, to: startToken, chain: e3.chain, source: e3.source, rate: e3.rate },
                                            ]
                                        };
                                    }
                                }
                            }
                        }
                        if (best) opps.push(best);
                    }
                }
            }
        }

        // Deduplicate? (A->B->C and B->C->A are same cycle).
        // Set of tokens key.

        return opps.sort((a, b) => b.profitBps - a.profitBps);
    }, [history, amount]);

    // Re-sort: same-category opportunities first, then by profitBps
    const sortedOpportunities = useMemo(() => {
        return [...opportunities].sort((a, b) => {
            const tokensA = [a.steps[0].from, a.steps[0].to, a.steps[1].to];
            const tokensB = [b.steps[0].from, b.steps[0].to, b.steps[1].to];
            const catA = getPairCategory(tokensA[0], tokensA[1]);
            const catB = getPairCategory(tokensB[0], tokensB[1]);
            const matchA = catA === currentCategory ? 0 : 1;
            const matchB = catB === currentCategory ? 0 : 1;
            if (matchA !== matchB) return matchA - matchB;
            return b.profitBps - a.profitBps;
        });
    }, [opportunities, currentCategory]);

    if (sortedOpportunities.length === 0) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500">
                No Triangular opportunities found (Requires data for A→B→C→A).
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Triangular Arbitrage Opportunities</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left">Path</th>
                            <th className="px-4 py-2 text-right">Profit</th>
                            <th className="px-4 py-2 text-left">Strategy</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sortedOpportunities.slice(0, 10).map((opp, idx) => (
                            <tr key={idx}>
                                <td className="px-4 py-3 font-medium">{opp.path}</td>
                                <td className="px-4 py-3 text-right font-bold text-green-600">+{opp.profitBps.toFixed(6)} bps</td>
                                <td className="px-4 py-3 text-xs text-gray-600">
                                    {opp.steps.map((s, i) => (
                                        <div key={i}>
                                            {i + 1}. {s.from}→{s.to} on {s.chain} ({s.source}) @ {s.rate.toFixed(6)}
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
