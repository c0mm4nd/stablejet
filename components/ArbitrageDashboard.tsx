'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { HistoryDataPoint } from '@/lib/history';
import RoundTripArbitrage from './RoundTripArbitrage';
import TriangularArbitrage from './TriangularArbitrage';

interface ArbitrageDashboardProps {
    history: HistoryDataPoint[];
    amount: number;
    pairId: string;
    onModeChange?: (mode: 'roundtrip' | 'triangular') => void;
}

export default function ArbitrageDashboard({ history, amount, pairId, onModeChange }: ArbitrageDashboardProps) {
    const searchParams = useSearchParams();

    // Initialize from URL params
    const [activeTab, setActiveTab] = useState<'roundtrip' | 'triangular'>(() => {
        const modeParam = searchParams.get('mode');
        return (modeParam === 'triangular' || modeParam === 'roundtrip') ? modeParam : 'roundtrip';
    });

    // Sync with URL params changes (browser back/forward)
    useEffect(() => {
        const modeParam = searchParams.get('mode');
        if (modeParam && (modeParam === 'roundtrip' || modeParam === 'triangular') && modeParam !== activeTab) {
            setActiveTab(modeParam);
            // Notify parent to avoid conflicts
            onModeChange?.(modeParam);
        }
    }, [searchParams]);

    const handleTabChange = (mode: 'roundtrip' | 'triangular') => {
        setActiveTab(mode);
        onModeChange?.(mode);
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-gray-200">
                <button
                    onClick={() => handleTabChange('roundtrip')}
                    className={`pb-2 px-4 font-medium transition-colors relative ${activeTab === 'roundtrip'
                            ? 'text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Round Trip (A→B→A)
                    {activeTab === 'roundtrip' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('triangular')}
                    className={`pb-2 px-4 font-medium transition-colors relative ${activeTab === 'triangular'
                            ? 'text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Triangular (A→B→C→A)
                    {activeTab === 'triangular' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                </button>
            </div>

            <div>
                {activeTab === 'roundtrip' && (
                    <RoundTripArbitrage history={history} amount={amount} pairId={pairId} />
                )}
                {activeTab === 'triangular' && (
                    <>
                        {/* Note: Triangular Arb works best when history contains data for multiple pairs. 
                  Currently the fetcher may only return the selected pair's data if filtered by API.
                  For full triangular support, ensure API returns all pairs or the dashboard fetches them.
              */}
                        <TriangularArbitrage history={history} amount={amount} />
                    </>
                )}
            </div>
        </div>
    );
}
