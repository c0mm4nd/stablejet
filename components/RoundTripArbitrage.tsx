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
    sellChain: string;   // 卖出 tokenA（A→B）的链
    sellSource: string;
    buyChain: string;    // 买回 tokenA（B→A）的链
    buySource: string;
    profitBps: number;
    profitUsd: number;
    sellRate: number;    // A→B 的汇率（tokenB per tokenA）
    buyRate: number;     // B→A 的汇率（tokenA per tokenB）
    sellInput: number;
    sellOutput: number;
    buyInput: number;
    buyOutput: number;
}

function formatQuoteAmount(value: number): string {
    if (!Number.isFinite(value)) return 'N/A';
    return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
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
        // Pre-filter: exclude data points where either direction is missing,
        // rates are not finite/positive, or the same-source same-chain roundtrip > 0.1 bps.
        const validData = data.filter(d => {
            const outAtoB = d.tokenAToB?.output;
            const outBtoA = d.tokenBToA?.output;
            if (!outAtoB || !outBtoA) return false;
            const inputAtoB = (d.tokenAToB!.input > 0) ? d.tokenAToB!.input : amount;
            const inputBtoA = (d.tokenBToA!.input > 0) ? d.tokenBToA!.input : amount;
            const rateAtoB = outAtoB / inputAtoB;
            const rateBtoA = outBtoA / inputBtoA;
            if (!isFinite(rateAtoB) || !isFinite(rateBtoA) || rateAtoB <= 0 || rateBtoA <= 0) return false;
            return (rateAtoB * rateBtoA - 1) * 10000 <= 0.1;
        });

        // sells: 用 tokenA 换出 tokenB（A→B），卖出 tokenA 的那一腿
        const sells = validData
            .filter(d => d.tokenAToB?.output && d.tokenAToB.output > 0)
            .map(d => {
                const input = (d.tokenAToB!.input > 0) ? d.tokenAToB!.input : amount;
                const output = d.tokenAToB!.output!;
                return { chain: d.chain, source: d.dataSource || 'unknown', rate: output / input, input, output };
            });

        // buys: 用 tokenB 换回 tokenA（B→A），买回 tokenA 的那一腿
        const buys = validData
            .filter(d => d.tokenBToA?.output && d.tokenBToA.output > 0)
            .map(d => {
                const input = (d.tokenBToA!.input > 0) ? d.tokenBToA!.input : amount;
                const output = d.tokenBToA!.output!;
                return { chain: d.chain, source: d.dataSource || 'unknown', rate: output / input, input, output };
            });

        const opps: ArbOpportunity[] = [];
        for (const sell of sells) {
            for (const buy of buys) {
                const finalRate = sell.rate * buy.rate;
                if (!isFinite(finalRate) || finalRate <= 0) continue;
                const profitBps = (finalRate - 1) * 10000;
                if (!isFinite(profitBps) || profitBps <= 0 || profitBps > 2000) continue;
                if (true) {
                    opps.push({
                        sellChain: sell.chain,
                        sellSource: sell.source,
                        buyChain: buy.chain,
                        buySource: buy.source,
                        profitBps,
                        profitUsd: amount * profitBps / 10000,
                        sellRate: sell.rate,
                        buyRate: buy.rate,
                        sellInput: sell.input,
                        sellOutput: sell.output,
                        buyInput: buy.input,
                        buyOutput: buy.output,
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
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buy {tokenA} ({tokenB}→{tokenA})</th>
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Sell {tokenA} ({tokenA}→{tokenB})</th>
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
                                            <div>{opp.buyRate.toFixed(6)}</div>
                                            <div className="mt-0.5 text-[10px] font-sans text-gray-400 whitespace-nowrap">
                                                {formatQuoteAmount(opp.buyInput)} {tokenB} → {formatQuoteAmount(opp.buyOutput)} {tokenA}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums font-mono text-gray-700">
                                            <div>{opp.sellRate.toFixed(6)}</div>
                                            <div className="mt-0.5 text-[10px] font-sans text-gray-400 whitespace-nowrap">
                                                {formatQuoteAmount(opp.sellInput)} {tokenA} → {formatQuoteAmount(opp.sellOutput)} {tokenB}
                                            </div>
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
