'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { HistoryDataPoint } from '@/lib/history';
import RoundTripArbitrage from './RoundTripArbitrage';
import TriangularArbitrage from './TriangularArbitrage';
import QuadrilateralArbitrage from './QuadrilateralArbitrage';

type ArbMode = 'roundtrip' | 'triangular' | 'quadrilateral';

interface ArbitrageDashboardProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId: string;
    onModeChange?: (mode: ArbMode) => void;
}

export default function ArbitrageDashboard({ history, amount, pairId, onModeChange }: ArbitrageDashboardProps) {
    const searchParams = useSearchParams();

    // Initialize from URL params
    const [activeTab, setActiveTab] = useState<ArbMode>(() => {
        const modeParam = searchParams.get('mode');
        return (modeParam === 'triangular' || modeParam === 'roundtrip' || modeParam === 'quadrilateral') ? modeParam as ArbMode : 'roundtrip';
    });

    // Sync with URL params changes (browser back/forward)
    useEffect(() => {
        const modeParam = searchParams.get('mode') as ArbMode | null;
        if (modeParam && (modeParam === 'roundtrip' || modeParam === 'triangular' || modeParam === 'quadrilateral') && modeParam !== activeTab) {
            setActiveTab(modeParam);
            onModeChange?.(modeParam);
        }
    }, [searchParams]);

    const handleTabChange = (mode: ArbMode) => {
        setActiveTab(mode);
        onModeChange?.(mode);
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-2 md:gap-4 border-b border-gray-200 overflow-x-auto">
                <button
                    onClick={() => handleTabChange('roundtrip')}
                    className={`pb-2 px-3 md:px-4 font-medium transition-colors relative whitespace-nowrap touch-manipulation ${activeTab === 'roundtrip'
                            ? 'text-blue-600'
                            : 'text-gray-500 hover:text-gray-700 active:text-gray-800'
                        }`}
                >
                    <span className="hidden md:inline">Round Trip (A→B→A)</span>
                    <span className="md:hidden">Round Trip</span>
                    {activeTab === 'roundtrip' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('triangular')}
                    className={`pb-2 px-3 md:px-4 font-medium transition-colors relative whitespace-nowrap touch-manipulation ${activeTab === 'triangular'
                            ? 'text-blue-600'
                            : 'text-gray-500 hover:text-gray-700 active:text-gray-800'
                        }`}
                >
                    <span className="hidden md:inline">Triangular (A→B→C→A)</span>
                    <span className="md:hidden">Triangular</span>
                    {activeTab === 'triangular' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('quadrilateral')}
                    className={`pb-2 px-3 md:px-4 font-medium transition-colors relative whitespace-nowrap touch-manipulation ${activeTab === 'quadrilateral'
                            ? 'text-blue-600'
                            : 'text-gray-500 hover:text-gray-700 active:text-gray-800'
                        }`}
                >
                    <span className="hidden md:inline">Quadrilateral (A→B→C→D→A)</span>
                    <span className="md:hidden">Quad</span>
                    {activeTab === 'quadrilateral' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                </button>
            </div>

            <div>
                {activeTab === 'roundtrip' && (
                    <RoundTripArbitrage history={history} amount={amount} pairId={pairId} />
                )}
                {activeTab === 'triangular' && (
                    <TriangularArbitrage history={history} amount={amount} pairId={pairId} />
                )}
                {activeTab === 'quadrilateral' && (
                    <QuadrilateralArbitrage history={history} amount={amount} pairId={pairId} />
                )}
            </div>
        </div>
    );
}
