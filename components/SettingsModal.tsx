'use client';

import { useState, useEffect } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import { ChainConfig } from '@/lib/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { chains, amounts, clientRefreshInterval, updateChains, updateAmounts, updateClientRefreshInterval, resetToDefaults } = useConfig();
  const [editingChains, setEditingChains] = useState<Record<string, ChainConfig>>(chains);
  const [editingAmounts, setEditingAmounts] = useState<number[]>(amounts);
  const [editingClientRefreshInterval, setEditingClientRefreshInterval] = useState<number>(clientRefreshInterval);
  const [newChainId, setNewChainId] = useState('');
  const [newChainName, setNewChainName] = useState('');
  const [newChainUsdc, setNewChainUsdc] = useState('');
  const [newChainUsdt, setNewChainUsdt] = useState('');
  const [newAmount, setNewAmount] = useState('');

  useEffect(() => {
    setEditingChains(chains);
    setEditingAmounts(amounts);
    setEditingClientRefreshInterval(clientRefreshInterval);
  }, [chains, amounts, clientRefreshInterval]);

  if (!isOpen) return null;

  const handleSave = () => {
    updateChains(editingChains);
    updateAmounts(editingAmounts);
    updateClientRefreshInterval(editingClientRefreshInterval);
    onClose();
  };

  const handleReset = () => {
    if (confirm('确定要重置到默认配置吗？')) {
      resetToDefaults();
      onClose();
    }
  };

  const handleAddChain = () => {
    if (!newChainId || !newChainName || !newChainUsdc || !newChainUsdt) {
      alert('请填写所有字段');
      return;
    }

    if (editingChains[newChainId]) {
      alert('该链ID已存在');
      return;
    }

    setEditingChains({
      ...editingChains,
      [newChainId]: {
        name: newChainName,
        usdc: newChainUsdc,
        usdt: newChainUsdt,
      },
    });

    setNewChainId('');
    setNewChainName('');
    setNewChainUsdc('');
    setNewChainUsdt('');
  };

  const handleDeleteChain = (chainId: string) => {
    const newChains = { ...editingChains };
    delete newChains[chainId];
    setEditingChains(newChains);
  };

  const handleUpdateChain = (chainId: string, field: keyof ChainConfig, value: string) => {
    setEditingChains({
      ...editingChains,
      [chainId]: {
        ...editingChains[chainId],
        [field]: value,
      },
    });
  };

  const handleAddAmount = () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('请输入有效的金额');
      return;
    }

    if (editingAmounts.includes(amount)) {
      alert('该金额已存在');
      return;
    }

    setEditingAmounts([...editingAmounts, amount].sort((a, b) => a - b));
    setNewAmount('');
  };

  const handleDeleteAmount = (index: number) => {
    setEditingAmounts(editingAmounts.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-primary">配置设置</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* 链配置部分 */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">支持的链</h3>

            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {Object.entries(editingChains).map(([chainId, config]) => (
                <div key={chainId} className="border rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        链ID
                      </label>
                      <input
                        type="text"
                        value={chainId}
                        disabled
                        className="w-full px-3 py-2 border rounded bg-gray-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        链名称
                      </label>
                      <input
                        type="text"
                        value={config.name}
                        onChange={(e) => handleUpdateChain(chainId, 'name', e.target.value)}
                        className="w-full px-3 py-2 border rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        USDC 地址
                      </label>
                      <input
                        type="text"
                        value={config.usdc}
                        onChange={(e) => handleUpdateChain(chainId, 'usdc', e.target.value)}
                        className="w-full px-3 py-2 border rounded font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        USDT 地址
                      </label>
                      <input
                        type="text"
                        value={config.usdt}
                        onChange={(e) => handleUpdateChain(chainId, 'usdt', e.target.value)}
                        className="w-full px-3 py-2 border rounded font-mono text-xs"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteChain(chainId)}
                    className="mt-3 text-red-600 hover:text-red-800 text-sm font-semibold"
                  >
                    删除此链
                  </button>
                </div>
              ))}
            </div>

            {/* 添加新链 */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <h4 className="font-semibold text-gray-700 mb-3">添加新链</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="链ID (如: ethereum)"
                  value={newChainId}
                  onChange={(e) => setNewChainId(e.target.value)}
                  className="px-3 py-2 border rounded text-sm"
                />
                <input
                  type="text"
                  placeholder="链名称 (如: Ethereum)"
                  value={newChainName}
                  onChange={(e) => setNewChainName(e.target.value)}
                  className="px-3 py-2 border rounded text-sm"
                />
                <input
                  type="text"
                  placeholder="USDC 地址"
                  value={newChainUsdc}
                  onChange={(e) => setNewChainUsdc(e.target.value)}
                  className="px-3 py-2 border rounded font-mono text-xs"
                />
                <input
                  type="text"
                  placeholder="USDT 地址"
                  value={newChainUsdt}
                  onChange={(e) => setNewChainUsdt(e.target.value)}
                  className="px-3 py-2 border rounded font-mono text-xs"
                />
              </div>
              <button
                onClick={handleAddChain}
                className="mt-3 bg-primary text-white px-4 py-2 rounded hover:opacity-90 text-sm font-semibold"
              >
                添加链
              </button>
            </div>
          </div>

          {/* 测试金额部分 */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">测试金额（输入数量）</h3>

            <div className="flex flex-wrap gap-2 mb-4">
              {editingAmounts.map((amount, index) => (
                <div
                  key={index}
                  className="bg-primary text-white px-4 py-2 rounded-full flex items-center gap-2"
                >
                  <span className="font-semibold">{amount.toLocaleString()}</span>
                  <button
                    onClick={() => handleDeleteAmount(index)}
                    className="hover:text-red-300 font-bold"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* 添加新金额 */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <h4 className="font-semibold text-gray-700 mb-3">添加新金额</h4>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="输入数量"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded text-sm"
                  min="0"
                  step="1000"
                />
                <button
                  onClick={handleAddAmount}
                  className="bg-primary text-white px-4 py-2 rounded hover:opacity-90 text-sm font-semibold"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          {/* 客户端刷新频率部分 */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">客户端刷新频率</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700">
                  每隔
                </label>
                <input
                  type="number"
                  value={editingClientRefreshInterval}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (value >= 1 && value <= 300) {
                      setEditingClientRefreshInterval(value);
                    }
                  }}
                  className="w-24 px-3 py-2 border rounded text-sm font-semibold text-center"
                  min="1"
                  max="300"
                />
                <label className="text-sm font-semibold text-gray-700">
                  秒刷新显示
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                控制本客户端刷新显示数据的频率。服务器后台任务独立获取数据，不受此配置影响。
              </p>
            </div>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-between items-center">
          <button
            onClick={handleReset}
            className="text-red-600 hover:text-red-800 font-semibold"
          >
            重置为默认
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50 font-semibold"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-primary text-white rounded hover:opacity-90 font-semibold"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
