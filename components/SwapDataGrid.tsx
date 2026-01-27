'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConfig } from '@/contexts/ConfigContext';
import { HistoryDataPoint } from '@/lib/history';
import Header from './Header';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';
import SettingsModal from './SettingsModal';
import QuotesTable from './QuotesTable';
import ArbitrageDashboard from './ArbitrageDashboard';

interface HistoryResponse {
  success: boolean;
  data: HistoryDataPoint[];
  pairId?: string;
  error?: string;
}

interface SwapDataGridProps {
  pairId: string;
}

export default function SwapDataGrid({ pairId }: SwapDataGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clientRefreshInterval, updateSelectedPair, pairs, isLoadingConfig } = useConfig();
  const [history, setHistory] = useState<HistoryDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(clientRefreshInterval);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Initialize state from URL params
  const [activeTab, setActiveTab] = useState<'quotes' | 'arbitrage'>(() => {
    const tabParam = searchParams.get('tab');
    return (tabParam === 'arbitrage' || tabParam === 'quotes') ? tabParam : 'quotes';
  });
  const [arbitrageMode, setArbitrageMode] = useState<'roundtrip' | 'triangular'>(() => {
    const modeParam = searchParams.get('mode');
    return (modeParam === 'triangular' || modeParam === 'roundtrip') ? modeParam : 'roundtrip';
  });

  const currentPairConfig = pairs[pairId];
  const amounts = currentPairConfig?.amounts || [];

  // Update URL params and pair when state changes (user action only)
  const updateUrlParams = useCallback((updates: { pair?: string; tab?: string; mode?: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.pair !== undefined) {
      params.set('pair', updates.pair);
    }
    if (updates.tab !== undefined) {
      params.set('tab', updates.tab);
    }
    if (updates.mode !== undefined) {
      params.set('mode', updates.mode);
    }

    const queryString = params.toString();
    // Use push to maintain browser history
    router.push(queryString ? `?${queryString}` : '/', { scroll: false });
  }, [router, searchParams]);

  // Handle pair change with URL update
  const handlePairChange = useCallback((newPairId: string) => {
    updateSelectedPair(newPairId);
    updateUrlParams({ pair: newPairId, tab: activeTab, mode: arbitrageMode });
  }, [updateSelectedPair, updateUrlParams, activeTab, arbitrageMode]);

  const buildApiUrl = (path: string, query?: Record<string, string | number | boolean | undefined>) => {
    const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
    const params = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return qs ? `${cleanPath}?${qs}` : cleanPath;
  };

  const fetchData = useCallback(async () => {
    try {
      const includeAllPairs = activeTab === 'arbitrage' && arbitrageMode === 'triangular';
      const historyResponse = await fetch(
        buildApiUrl('/api/history', { hours: 24, pair: includeAllPairs ? undefined : pairId, _ts: Date.now() }),
        { cache: 'no-store' }
      );
      const historyResult: HistoryResponse = await historyResponse.json();

      if (historyResult.success && historyResult.data.length > 0) {
        setHistory(historyResult.data);
        setTimestamp(historyResult.data[historyResult.data.length - 1].timestamp);
        setError(null);
      } else {
        setHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
      setCountdown(clientRefreshInterval);
    }
  }, [clientRefreshInterval, pairId, activeTab, arbitrageMode]);

  // Initialize URL params on first load if they don't exist
  useEffect(() => {
    const pairParam = searchParams.get('pair');
    const tabParam = searchParams.get('tab');
    const modeParam = searchParams.get('mode');

    // Set defaults if params are missing
    const needsUpdate = !pairParam || !tabParam || !modeParam;
    if (needsUpdate) {
      const params = new URLSearchParams(searchParams.toString());
      if (!pairParam) params.set('pair', pairId);
      if (!tabParam) params.set('tab', 'quotes');
      if (!modeParam) params.set('mode', 'roundtrip');
      const queryString = params.toString();
      router.replace(queryString ? `?${queryString}` : '/', { scroll: false });
    }
  }, []); // Run only once on mount

  // Sync pairId from URL params
  useEffect(() => {
    const pairParam = searchParams.get('pair');
    if (pairParam && pairParam !== pairId && pairs[pairParam] && !pairs[pairParam].disabled) {
      updateSelectedPair(pairParam);
    }
  }, [searchParams, pairs, pairId, updateSelectedPair]);

  // Sync state from URL params on mount or when URL changes (browser back/forward)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const modeParam = searchParams.get('mode');

    if (tabParam && (tabParam === 'quotes' || tabParam === 'arbitrage') && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    if (modeParam && (modeParam === 'roundtrip' || modeParam === 'triangular') && modeParam !== arbitrageMode) {
      setArbitrageMode(modeParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const nextActivePair = activeTab === 'arbitrage' && arbitrageMode === 'triangular'
      ? 'all'
      : pairId;

    fetch('/api/background/active-pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId: nextActivePair })
    }).catch(() => {});

    setIsLoading(true);
    fetchData();

    const fetchInterval = setInterval(fetchData, clientRefreshInterval * 1000);
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : clientRefreshInterval));
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(countdownInterval);
    };
  }, [clientRefreshInterval, fetchData, pairId, activeTab, arbitrageMode]);

  if (isLoadingConfig) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }

  if (!currentPairConfig) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <div className="text-xl font-semibold text-gray-700">Trading Pair Not Found</div>
        <button onClick={() => setIsSettingsOpen(true)} className="text-blue-600 hover:underline">Open Settings</button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }
  if (currentPairConfig.disabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <div className="text-xl font-semibold text-gray-700">Trading Pair Disabled</div>
        <button onClick={() => setIsSettingsOpen(true)} className="text-blue-600 hover:underline">Open Settings</button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header
        countdown={countdown}
        selectedPair={pairId}
        onPairChange={handlePairChange}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <main className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex">
            <button
              onClick={() => {
                setActiveTab('quotes');
                updateUrlParams({ pair: pairId, tab: 'quotes', mode: arbitrageMode });
              }}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'quotes'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
            >
              Quotes
            </button>
            <button
              onClick={() => {
                setActiveTab('arbitrage');
                updateUrlParams({ pair: pairId, tab: 'arbitrage', mode: arbitrageMode });
              }}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'arbitrage'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
            >
              Arbitrage
            </button>
          </div>
        </div>

        {isLoading && history.length === 0 ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-2xl shadow-sm border border-gray-100">
            Waiting for data...
          </div>
        ) : (
          <div className="space-y-12">
            {amounts.map((amount) => (
              <div key={amount} className="space-y-4">
                {/* Amount Header if multiple amounts exist, or just clear separation */}
                {amounts.length > 0 && (
                  <div className="flex items-center gap-4">
                    <hr className="flex-1 border-gray-200" />
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                      Amount: {amount.toLocaleString()}
                    </span>
                    <hr className="flex-1 border-gray-200" />
                  </div>
                )}

                {activeTab === 'quotes' && (
                  <QuotesTable history={history} amount={amount} pairId={pairId} />
                )}
                {activeTab === 'arbitrage' && (
                  <ArbitrageDashboard
                    history={history}
                    amount={amount}
                    pairId={pairId}
                    onModeChange={(mode) => {
                      setArbitrageMode(mode);
                      updateUrlParams({ pair: pairId, tab: activeTab, mode });
                    }}
                  />
                )}
              </div>
            ))}

            {timestamp && (
              <div className="text-center text-gray-400 mt-8 text-sm">
                Last Update: {new Date(timestamp).toLocaleString()} | Data Points: {history.length}
              </div>
            )}
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
