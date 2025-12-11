'use client';

import { useState, useEffect } from 'react';
import { SwapDataResponse } from '@/lib/types';
import { HistoryDataPoint } from '@/lib/history';
import Header from './Header';
import HistoryChartsView from './HistoryChartsView';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface HistoryResponse {
  success: boolean;
  data: HistoryDataPoint[];
  error?: string;
}

export default function SwapDataGrid() {
  const [history, setHistory] = useState<HistoryDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(10);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchData = async () => {
    try {
      // 获取最新数据（会自动保存到历史记录）
      const swapResponse = await fetch('/api/swap-data');
      const swapResult: SwapDataResponse = await swapResponse.json();

      if (swapResult.success) {
        setTimestamp(swapResult.timestamp);
        setError(null);
      }

      // 获取历史数据
      const historyResponse = await fetch('/api/history?hours=24');
      const historyResult: HistoryResponse = await historyResponse.json();

      if (historyResult.success) {
        setHistory(historyResult.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
      setCountdown(10);
    }
  };

  useEffect(() => {
    fetchData();

    const fetchInterval = setInterval(fetchData, 10000);
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 10));
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(countdownInterval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-purple-700 p-6">
      <div className="max-w-7xl mx-auto">
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
    </div>
  );
}
