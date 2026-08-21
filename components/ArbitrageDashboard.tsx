'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { HistoryDataPoint } from '@/lib/history';
import RoundTripArbitrage from './RoundTripArbitrage';
import GlobalRoundTripArbitrage from './GlobalRoundTripArbitrage';
import TriangularArbitrage from './TriangularArbitrage';
import QuadrilateralArbitrage from './QuadrilateralArbitrage';

type ArbMode = 'roundtrip' | 'globalroundtrip' | 'triangular' | 'quadrilateral';
const GLOBAL_MODES: ArbMode[] = ['globalroundtrip', 'triangular', 'quadrilateral'];

function isArbMode(v: string | null): v is ArbMode {
    return v === 'roundtrip' || v === 'globalroundtrip' || v === 'triangular' || v === 'quadrilateral';
}

interface ArbitrageDashboardProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId: string;
    onModeChange?: (mode: ArbMode) => void;
}

export default function ArbitrageDashboard({ history, amount, pairId, onModeChange }: ArbitrageDashboardProps) {
    const searchParams = useSearchParams();

    // Initialize from URL params
    const [activeMode, setActiveMode] = useState<ArbMode>(() => {
        const modeParam = searchParams.get('mode');
        return isArbMode(modeParam) ? modeParam : 'roundtrip';
    });

    // Sync with URL params changes (browser back/forward)
    useEffect(() => {
        const modeParam = searchParams.get('mode');
        if (isArbMode(modeParam) && modeParam !== activeMode) {
            setActiveMode(modeParam);
            onModeChange?.(modeParam);
        }
    }, [searchParams]);

    const handleModeChange = (mode: ArbMode) => {
        setActiveMode(mode);
        onModeChange?.(mode);
    };

    const isGlobal = GLOBAL_MODES.includes(activeMode);

    const scopeButton = (label: string, active: boolean, onClick: () => void) => (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors touch-manipulation ${active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
                }`}
        >
            {label}
        </button>
    );

    const subTab = (mode: ArbMode, full: string, short: string) => (
        <button
            onClick={() => handleModeChange(mode)}
            className={`pb-2 px-3 md:px-4 font-medium transition-colors relative whitespace-nowrap touch-manipulation ${activeMode === mode
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700 active:text-gray-800'
                }`}
        >
            <span className="hidden md:inline">{full}</span>
            <span className="md:hidden">{short}</span>
            {activeMode === mode && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
            )}
        </button>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1 w-fit">
                {scopeButton('Current Pair', !isGlobal, () => handleModeChange('roundtrip'))}
                {scopeButton('Global', isGlobal, () => handleModeChange('globalroundtrip'))}
            </div>

            {isGlobal && (
                <div className="flex gap-2 md:gap-4 border-b border-gray-200 overflow-x-auto">
                    {subTab('globalroundtrip', 'Round Trip (A→B→A)', 'Round Trip')}
                    {subTab('triangular', 'Triangular (A→B→C→A)', 'Triangular')}
                    {subTab('quadrilateral', 'Quadrilateral (A→B→C→D→A)', 'Quad')}
                </div>
            )}

            <div>
                {activeMode === 'roundtrip' && (
                    <RoundTripArbitrage history={history} amount={amount} pairId={pairId} />
                )}
                {activeMode === 'globalroundtrip' && (
                    <GlobalRoundTripArbitrage history={history} />
                )}
                {activeMode === 'triangular' && (
                    <TriangularArbitrage history={history} amount={amount} pairId={pairId} />
                )}
                {activeMode === 'quadrilateral' && (
                    <QuadrilateralArbitrage history={history} amount={amount} pairId={pairId} />
                )}
            </div>
        </div>
    );
}
