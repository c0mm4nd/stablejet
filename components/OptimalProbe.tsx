'use client';

import { useState } from 'react';

export interface ProbePoint {
    amount: number;
    sellOutput: number | null;
    buyOutput: number | null;
    profitAmount: number | null;
    profitBps: number | null;
    sellTool?: string;
    buyTool?: string;
}

export interface ProbeResult {
    points: ProbePoint[];
    best: ProbePoint | null;
}

export type ProbeState = ProbeResult | { error: string };

export interface ProbeRequest {
    pairId: string;
    sellChainKey: string;
    sellSource: string;
    buyChainKey: string;
    buySource: string;
    baseAmount: number;
}

export function formatQuoteAmount(value: number): string {
    if (!Number.isFinite(value)) return 'N/A';
    return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// 共享的最优金额探测状态：同一时间只允许一个探测，结果按机会键缓存
export function useOptimalProbe() {
    const [probing, setProbing] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, ProbeState>>({});
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    const runProbe = async (key: string, req: ProbeRequest) => {
        const cached = results[key];
        if (cached && !('error' in cached)) {
            setExpandedKey(prev => (prev === key ? null : key));
            return;
        }
        if (probing) return;
        setProbing(key);
        setExpandedKey(key);
        try {
            const res = await fetch('/api/optimal-amount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req),
            });
            const json = await res.json();
            if (json.success) {
                setResults(prev => ({ ...prev, [key]: { points: json.points, best: json.best } }));
            } else {
                setResults(prev => ({ ...prev, [key]: { error: json.error || 'Probe failed' } }));
            }
        } catch (e) {
            setResults(prev => ({ ...prev, [key]: { error: e instanceof Error ? e.message : 'Network error' } }));
        } finally {
            setProbing(null);
        }
    };

    return { probing, results, expandedKey, runProbe };
}

export function OptimalCell({ state, isProbing, anyProbing, tokenA, onClick }: {
    state: ProbeState | undefined;
    isProbing: boolean;
    anyProbing: boolean;
    tokenA: string;
    onClick: () => void;
}) {
    return (
        <td className="px-3 py-2 text-right whitespace-nowrap">
            {state && !('error' in state) && state.best ? (
                <button
                    onClick={onClick}
                    className="font-mono text-[11px] text-blue-700 hover:text-blue-900 tabular-nums"
                    title="Toggle amount ladder"
                >
                    {formatQuoteAmount(state.best.amount)} {tokenA}
                    <span className="text-emerald-600 font-semibold ml-1">
                        +{(state.best.profitAmount ?? 0).toFixed(2)}
                    </span>
                </button>
            ) : state && 'error' in state ? (
                <button onClick={onClick} className="text-[11px] text-rose-500 hover:text-rose-700" title={state.error}>
                    Failed · Retry
                </button>
            ) : (
                <button
                    onClick={onClick}
                    disabled={anyProbing}
                    className="text-[11px] px-2 py-0.5 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isProbing ? 'Probing…' : '⚡ Optimize'}
                </button>
            )}
        </td>
    );
}

export function ProbeDetailRow({ result, tokenA, tokenB, colSpan }: {
    result: ProbeResult;
    tokenA: string;
    tokenB: string;
    colSpan: number;
}) {
    return (
        <tr className="bg-blue-50/30">
            <td colSpan={colSpan} className="px-4 py-3">
                <div className="text-[11px] text-gray-500 mb-2">
                    Live chained quotes ({tokenA}→{tokenB} output feeds the return leg) · profit by size:
                </div>
                <div className="flex flex-wrap gap-2">
                    {result.points.map((p, i) => {
                        const isBest = result.best && p.amount === result.best.amount && p.profitAmount === result.best.profitAmount;
                        const ok = p.profitAmount !== null;
                        return (
                            <div key={i} className={`rounded-lg border px-3 py-1.5 text-[11px] tabular-nums ${isBest ? 'border-emerald-400 bg-emerald-50' : ok ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                                <div className="font-mono font-medium">{formatQuoteAmount(p.amount)} {tokenA}</div>
                                {ok ? (
                                    <div className={`font-mono ${p.profitAmount! > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {p.profitAmount! > 0 ? '+' : ''}{p.profitAmount!.toFixed(2)} ({p.profitBps!.toFixed(2)} bps)
                                    </div>
                                ) : (
                                    <div>No quote</div>
                                )}
                                {isBest && <div className="text-emerald-600 font-semibold">★ Best</div>}
                            </div>
                        );
                    })}
                </div>
            </td>
        </tr>
    );
}
