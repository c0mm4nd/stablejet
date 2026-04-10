'use client';

import { useMemo } from 'react';
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
    profitUsd: number;
    buyRate: number;
    sellRate: number;
}

export default function RoundTripArbitrage({ history, amount, pairId }: RoundTripArbitrageProps) {
    const { pairs, sources } = useConfig();
    const configPair = pairs[pairId];
    const [fallbackA, fallbackB] = pairId.split('_');
    const tokenA = configPair?.tokenA || fallbackA || 'TokenA';
    const tokenB = configPair?.tokenB || fallbackB || 'TokenB';

    if (history.length === 0) return null;

    const latest = history[history.length - 1];
    const data = latest.data
        .filter(d => d.amount === amount)
        .filter(d => isSourceEnabled(d.dataSource, sources));

    const opportunities = useMemo((): ArbOpportunity[] => {
        const buys = data
            .filter(d => d.tokenAToB?.output && d.tokenAToB.output > 0)
            .map(d => ({
                chain: d.chain,
                source: d.dataSource || 'kyberswap',
                rate: d.tokenAToB!.output! / (d.tokenAToB!.input || amount),
            }));

        const sells = data
            .filter(d => d.tokenBToA?.output && d.tokenBToA.output > 0)
            .map(d => ({
                chain: d.chain,
                source: d.dataSource || 'kyberswap',
                rate: d.tokenBToA!.output! / (d.tokenBToA!.input || amount),
            }));

        const opps: ArbOpportunity[] = [];
        for (const buy of buys) {
            for (const sell of sells) {
                const finalRate = buy.rate * sell.rate;
                const profitBps = (finalRate - 1) * 10000;
                if (profitBps > 0) {
                    opps.push({
                        buyChain: buy.chain,
                        buySource: buy.source,
                        sellChain: sell.chain,
                        sellSource: sell.source,
                        profitBps,
                        profitUsd: amount * profitBps / 10000,
                        buyRate: buy.rate,
                        sellRate: sell.rate,
                    });
                }
            }
        }
        return opps.sort((a, b) => b.profitBps - a.profitBps);
    }, [data, amount]);

    const top = opportunities.slice(0, 20);
    const maxProfit = top.length > 0 ? top[0].profitBps : 0;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-gray-800">Round Trip Arbitrage</h2>
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-md px-2 py-0.5 tabular-nums">
                        {amount.toLocaleString()} {tokenA}
                    </span>
                </div>
                {opportunities.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{opportunities.length} opportunities</span>
                        <span className="text-emerald-600 font-semibold tabular-nums">
                            best +{maxProfit.toFixed(2)} bps
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
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buy ({tokenA}→{tokenB})</th>
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Sell ({tokenB}→{tokenA})</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buy Rate</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Sell Rate</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Profit (bps)</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Est. Profit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {top.map((opp, idx) => {
                                const isTop3 = idx < 3;
                                return (
                                    <tr key={idx} className={`hover:bg-blue-50/20 transition-colors ${isTop3 ? 'bg-emerald-50/20' : ''}`}>
                                        <td className="px-3 py-2 text-gray-400 tabular-nums font-mono text-center">
                                            {idx + 1}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <div className="font-medium text-gray-800">{opp.buyChain}</div>
                                            <div className="text-[10px] text-gray-400">{opp.buySource}</div>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <div className="font-medium text-gray-800">{opp.sellChain}</div>
                                            <div className="text-[10px] text-gray-400">{opp.sellSource}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums font-mono text-gray-700">
                                            {opp.buyRate.toFixed(6)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums font-mono text-gray-700">
                                            {opp.sellRate.toFixed(6)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            <span className="font-mono font-bold text-emerald-600">
                                                +{opp.profitBps.toFixed(4)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            <span className="font-mono text-emerald-700 font-semibold">
                                                ${opp.profitUsd.toFixed(2)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
