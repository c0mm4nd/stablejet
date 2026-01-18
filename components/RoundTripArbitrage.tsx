'use client';

import { useMemo, useState } from 'react';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import { isSourceEnabled } from '@/lib/utils';

interface RoundTripArbitrageProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId: string;
}

interface ArbOpportunity {
    buyChain: string;
    buySource: string;
    sellChain: string;
    sellSource: string;
    profitBps: number;
    buyPrice: number; // Rate A->B
    sellPrice: number; // Rate B->A
    path: string; // Description
}

export default function RoundTripArbitrage({ history, amount, pairId }: RoundTripArbitrageProps) {
    const { pairs, sources } = useConfig();
    const configPair = pairs[pairId];
    const [fallbackA, fallbackB] = pairId.split('_');
    const tokenA = configPair?.tokenA || fallbackA || 'TokenA';
    const tokenB = configPair?.tokenB || fallbackB || 'TokenB';

    if (history.length === 0) return null;

    // Get latest data
    const latest = history[history.length - 1]; // Assuming sorted by time
    const data = latest.data
        .filter(d => d.amount === amount)
        .filter(d => isSourceEnabled(d.dataSource, sources));

    // Strategy: 
    // 1. Find Best Buy (Maximize Output A->B)
    // 2. Find Best Sell (Maximize Output B->A)
    // Note: Buy A->B means we get B. Sell B->A means we give B to get A.
    // Wait, Round Trip: Start with A -> Buy B (somewhere) -> Sell B for A (somewhere).
    // Return > Input means profit.
    // Profit = Final A - Initial A.

    // Actually, we can just look for ANY combination:
    // For each Chain1/Source1 (A->B) AND Chain2/Source2 (B->A):
    // Calculate Profit.

    // Optimization: Just find Top 3 Buy and Top 3 Sell? 
    // Or just iterate all ~10-20 * 10-20 = 400 combinations. It's cheap.

    const opportunities = useMemo(() => {
        const opps: ArbOpportunity[] = [];

        // Valid Buy Quotes (A->B)
        const buys = data.filter(d => d.tokenAToB?.output && d.tokenAToB.output > 0).map(d => ({
            chain: d.chain,
            source: d.dataSource || 'kyberswap',
            output: d.tokenAToB!.output!, // Output B
            rate: d.tokenAToB!.output! / d.tokenAToB!.input // Rate A->B
        }));

        // Valid Sell Quotes (B->A)
        // Here we need to simulate selling the B we got.
        // Ideally we enter with `amount`. We get `outputB`.
        // Then we sell `outputB`. 
        // BUT the data we have is for fixed input `amount` (of B).
        // Price might slightly differ for `outputB` vs `amount`.
        // Approximation: Use the Rate of B->A for `amount` input.
        // Final A = Output A->B * Rate(B->A at `amount`).
        // Valid if linearity holds (stablecoins usually close enough).

        const sells = data.filter(d => d.tokenBToA?.output && d.tokenBToA.output > 0).map(d => ({
            chain: d.chain,
            source: d.dataSource || 'kyberswap',
            rate: d.tokenBToA!.output! / d.tokenBToA!.input // Rate B->A = Output A / Input B
        }));

        for (const buy of buys) {
            for (const sell of sells) {
                // Calculate Round Trip
                // Start 1 Unit A. 
                // Get `buy.rate` Unit B.
                // Get `buy.rate * sell.rate` Unit A.
                const finalRate = buy.rate * sell.rate;
                const profitBps = (finalRate - 1) * 10000;

                if (profitBps > 0) { // Only show positive or near positive
                    opps.push({
                        buyChain: buy.chain,
                        buySource: buy.source,
                        sellChain: sell.chain,
                        sellSource: sell.source,
                        profitBps,
                        buyPrice: buy.rate,
                        sellPrice: sell.rate,
                        path: `${tokenA}→${tokenB} (${buy.chain}) → ${tokenA} (${sell.chain})`
                    });
                }
            }
        }

        return opps.sort((a, b) => b.profitBps - a.profitBps); // Descending
    }, [data, tokenA, tokenB]);

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Round Trip Arbitrage Opportunities</h2>
            {opportunities.length === 0 ? (
                <p className="text-gray-500">No profitable opportunities found (&gt;0 bps).</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-700">
                            <tr>
                                <th className="px-4 py-2 text-left">Path</th>
                                <th className="px-4 py-2 text-right">Profit (bps)</th>
                                <th className="px-4 py-2 text-right">Buy Rate ({tokenA}→{tokenB})</th>
                                <th className="px-4 py-2 text-right">Sell Rate ({tokenB}→{tokenA})</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {opportunities.slice(0, 20).map((opp, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-gray-900">{opp.path}</div>
                                        <div className="text-xs text-gray-500">
                                            Buy: {opp.buyChain} ({opp.buySource}) | Sell: {opp.sellChain} ({opp.sellSource})
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-green-600">
                                        +{opp.profitBps.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                        {opp.buyPrice.toFixed(4)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                        {opp.sellPrice.toFixed(4)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
