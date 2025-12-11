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
  error?: string;
}

export default function SwapDataGrid() {
  const { clientRefreshInterval } = useConfig();
  const [history, setHistory] = useState<HistoryDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(clientRefreshInterval);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    try {
      // 只获取历史数据（数据由服务器后台任务定期更新）
      const historyResponse = await fetch('/api/history?hours=24');
      const historyResult: HistoryResponse = await historyResponse.json();

      if (historyResult.success && historyResult.data.length > 0) {
        setHistory(historyResult.data);
        // 使用最新数据点的时间戳
        setTimestamp(historyResult.data[historyResult.data.length - 1].timestamp);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
      setCountdown(clientRefreshInterval);
    }
  }, [clientRefreshInterval]);

  // 客户端定期刷新显示的数据
  useEffect(() => {
    fetchData();

    const fetchInterval = setInterval(fetchData, clientRefreshInterval * 1000);
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : clientRefreshInterval));
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(countdownInterval);
    };
  }, [clientRefreshInterval, fetchData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-purple-700 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 设置按钮 */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="bg-white text-primary px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 font-semibold flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            配置设置
          </button>
        </div>

        <Header countdown={countdown} />

        {isLoading && history.length === 0 ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : (
          <>
            <HistoryChartsView history={history} />

            {timestamp && (
              <div className="text-center text-white mt-8 text-sm opacity-80">
                最后更新: {new Date(timestamp).toLocaleString('zh-CN')} |
                历史数据点: {history.length}
              </div>
            )}
          </>
        )}
      </div>

      {/* 设置模态框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
