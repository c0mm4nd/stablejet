'use client';

import { useState, useEffect, useCallback } from 'react';
import { SwapDataResponse } from '@/lib/types';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import Header from './Header';
import HistoryChartsView from './HistoryChartsView';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';
import SettingsModal from './SettingsModal';

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
  const { clientRefreshInterval, updateSelectedPair } = useConfig();
  const [history, setHistory] = useState<HistoryDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(clientRefreshInterval);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const buildApiUrl = (path: string, query?: Record<string, string | number | boolean | undefined>) => {
    // Always use a no-trailing-slash form for API routes
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
      // 只获取历史数据（数据由服务器后台任务定期更新）
      const historyResponse = await fetch(
        buildApiUrl('/api/history', { hours: 24, pair: pairId, _ts: Date.now() }),
        { cache: 'no-store' }
      );
      const historyResult: HistoryResponse = await historyResponse.json();

      if (historyResult.success && historyResult.data.length > 0) {
        setHistory(historyResult.data);
        // 使用最新数据点的时间戳
        setTimestamp(historyResult.data[historyResult.data.length - 1].timestamp);
        setError(null);
      } else {
        // 如果没有数据，清空历史数据
        setHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
      setCountdown(clientRefreshInterval);
    }
  }, [clientRefreshInterval, pairId]);

  // 客户端定期刷新显示的数据
  useEffect(() => {
    // Reset loading state when pair changes
    setIsLoading(true);
    setHistory([]);
    
    fetchData();

    const fetchInterval = setInterval(fetchData, clientRefreshInterval * 1000);
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : clientRefreshInterval));
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(countdownInterval);
    };
  }, [clientRefreshInterval, fetchData, pairId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header 固定在顶部 */}
      <Header 
        countdown={countdown}
        selectedPair={pairId}
        onPairChange={updateSelectedPair}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      {/* 主内容区域 */}
      <main className="max-w-[1920px] mx-auto px-6 py-8">
        {isLoading && history.length === 0 ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : history.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-700 text-lg font-medium mb-2">等待数据收集</p>
            <p className="text-gray-500">当前交易对暂无历史数据，数据每 10 秒更新一次</p>
          </div>
        ) : (
          <>
            <HistoryChartsView history={history} pairId={pairId} />

            {timestamp && (
              <div className="text-center text-gray-400 mt-8 text-sm">
                最后更新: {new Date(timestamp).toLocaleString('zh-CN')} | 数据点: {history.length}
              </div>
            )}
          </>
        )}
      </main>

      {/* 设置模态框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
