'use client';

import { useState, useRef, useEffect } from 'react';
import { useConfig } from '@/contexts/ConfigContext';

interface HeaderProps {
  countdown: number;
  selectedPair: string;
  onPairChange: (pairId: string) => void;
  onSettingsClick: () => void;
}

export default function Header({ countdown, selectedPair, onPairChange, onSettingsClick }: HeaderProps) {
  const { pairs: pairsConfig } = useConfig();
  const pairs = Object.values(pairsConfig).filter(pair => !pair.disabled);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 获取当前选中的交易对名称
  const selectedPairName = pairs.find(p => p.id === selectedPair)?.name || '';

  // 过滤匹配的交易对
  const filteredPairs = pairs.filter(pair => {
    const query = searchQuery.toLowerCase();
    return (
      pair.name.toLowerCase().includes(query) ||
      pair.tokenA.toLowerCase().includes(query) ||
      pair.tokenB.toLowerCase().includes(query)
    );
  });

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePairSelect = (pairId: string) => {
    onPairChange(pairId);
    setSearchQuery('');
    setShowDropdown(false);
  };

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between gap-3 md:gap-6">
          {/* 左侧：仅Logo */}
          <div className="flex items-center flex-shrink-0">
            <div className="w-9 h-9 md:w-10 md:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            {/* 桌面端显示标题 */}
            <div className="ml-3 hidden lg:block">
              <h1 className="text-xl font-bold text-gray-800">StableJet Monitor</h1>
              <p className="text-xs text-gray-500">稳定交易对跨链套利监控</p>
            </div>
          </div>

          {/* 中间：桌面端显示交易对搜索 */}
          <div className="hidden md:flex flex-1 max-w-md" ref={searchRef}>
            <div className="relative w-full">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">交易对:</span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder={`当前: ${selectedPairName} (输入搜索...)`}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* 下拉搜索结果 */}
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 ml-16">
                  {filteredPairs.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto">
                      {filteredPairs.map((pair) => (
                        <button
                          key={pair.id}
                          onClick={() => handlePairSelect(pair.id)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between group ${selectedPair === pair.id ? 'bg-blue-50' : ''
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${selectedPair === pair.id ? 'bg-blue-600' : 'bg-gray-300'
                              }`}></div>
                            <div>
                              <div className="font-medium text-gray-800">{pair.name}</div>
                              <div className="text-xs text-gray-500">
                                {pair.tokenA} ⇄ {pair.tokenB}
                              </div>
                            </div>
                          </div>
                          {selectedPair === pair.id && (
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-gray-500 text-sm">
                      <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>未找到匹配的交易对</p>
                      <p className="text-xs mt-1">试试输入代币符号</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：倒计时图标和设置 */}
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            {/* 倒计时图标 */}
            <div className="relative flex items-center justify-center">
              {/* 圆形进度指示器 */}
              <svg className="w-8 h-8 md:w-9 md:h-9 -rotate-90" viewBox="0 0 36 36">
                {/* 背景圆 */}
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  className="stroke-gray-200"
                  strokeWidth="2"
                />
                {/* 进度圆 */}
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  className="stroke-green-500"
                  strokeWidth="2"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${2 * Math.PI * 16 * (1 - countdown / 10)}`}
                  strokeLinecap="round"
                />
              </svg>
              {/* 时钟图标 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* 设置按钮 */}
            <button
              onClick={onSettingsClick}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="设置"
              aria-label="配置设置"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-600"
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
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
