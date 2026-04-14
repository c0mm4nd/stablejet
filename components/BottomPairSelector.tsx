'use client';

import { useState, useRef, useEffect } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import { getPairCategory, CATEGORY_LABEL, CATEGORY_ORDER, PairCategory } from '@/lib/utils';

interface BottomPairSelectorProps {
  selectedPair: string;
  onPairChange: (pairId: string) => void;
}

export default function BottomPairSelector({ selectedPair, onPairChange }: BottomPairSelectorProps) {
  const { pairs: pairsConfig } = useConfig();
  const pairs = Object.values(pairsConfig).filter(pair => !pair.disabled);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 获取当前选中的交易对信息
  const selectedPairConfig = pairs.find(p => p.id === selectedPair);
  const selectedPairName = selectedPairConfig?.name || '';

  // 过滤匹配的交易对
  const filteredPairs = pairs.filter(pair => {
    const query = searchQuery.toLowerCase();
    return (
      pair.name.toLowerCase().includes(query) ||
      pair.tokenA.toLowerCase().includes(query) ||
      pair.tokenB.toLowerCase().includes(query)
    );
  });

  // 按分类分组
  const groupedPairs = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = filteredPairs.filter(p => getPairCategory(p.tokenA, p.tokenB) === cat);
    return acc;
  }, {} as Record<PairCategory, typeof filteredPairs>);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setSearchQuery('');
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
    <>
      {/* 移动端：固定在底部的交易对选择器 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg safe-area-pb">
        <div className="px-4 py-3" ref={searchRef}>
          {/* 交易对选择按钮 */}
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:shadow-md transition-all active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-xs text-gray-500">当前交易对</div>
                <div className="text-sm font-semibold text-gray-800">{selectedPairName}</div>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 下拉面板 */}
          {showDropdown && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-t-2xl shadow-2xl overflow-hidden">
              {/* 搜索框 */}
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索交易对..."
                    className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-xl text-[16px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* 交易对列表 */}
              <div className="max-h-[50vh] overflow-y-auto">
                {filteredPairs.length > 0 ? (
                  <div>
                    {CATEGORY_ORDER.map(cat => {
                      const catPairs = groupedPairs[cat];
                      if (catPairs.length === 0) return null;
                      return (
                        <div key={cat}>
                          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-y border-gray-100">
                            {CATEGORY_LABEL[cat]}
                          </div>
                          {catPairs.map((pair) => (
                            <button
                              key={pair.id}
                              onClick={() => handlePairSelect(pair.id)}
                              className={`w-full px-4 py-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-between ${selectedPair === pair.id ? 'bg-blue-50' : ''}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${selectedPair === pair.id ? 'bg-blue-600' : 'bg-gray-300'}`} />
                                <div>
                                  <div className="font-medium text-gray-800 text-sm">{pair.name}</div>
                                  <div className="text-xs text-gray-500">{pair.tokenA} ⇄ {pair.tokenB}</div>
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
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-12 text-center text-gray-500 text-sm">
                    <svg className="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="font-medium">未找到匹配的交易对</p>
                    <p className="text-xs mt-1">试试输入代币符号</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 占位符，防止内容被底部栏遮挡 */}
      <div className="md:hidden h-20" />
    </>
  );
}
