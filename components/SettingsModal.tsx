'use client';

import { useState, useEffect } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import { ChainAppConfig, TradingPairConfig } from '@/lib/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { chains, pairs, clientRefreshInterval, updateChains, updatePairs, updateClientRefreshInterval } = useConfig();

  // Local State for Edit Mode
  const [editingChains, setEditingChains] = useState<Record<string, ChainAppConfig>>({});
  const [editingPairs, setEditingPairs] = useState<Record<string, TradingPairConfig>>({});
  const [editingInterval, setEditingInterval] = useState<number>(10);

  // UI State: Active Editing Pair ID
  const [activePairId, setActivePairId] = useState<string | null>(null);

  // New Item States
  // Chain
  const [newChainId, setNewChainId] = useState('');
  const [newChainName, setNewChainName] = useState('');
  const [newKyberCode, setNewKyberCode] = useState('');
  const [newNordsternCode, setNewNordsternCode] = useState('');
  const [newLiFiChainId, setNewLiFiChainId] = useState('');

  // Pair
  const [newPairId, setNewPairId] = useState('');
  const [newPairName, setNewPairName] = useState(''); // e.g. "USDC/USDT"
  const [newPairTokenA, setNewPairTokenA] = useState(''); // "USDC"
  const [newPairTokenB, setNewPairTokenB] = useState(''); // "USDT"

  // Pair Amount
  const [newAmount, setNewAmount] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEditingChains(chains);
      setEditingPairs(pairs);
      setEditingInterval(clientRefreshInterval);
    }
  }, [isOpen, chains, pairs, clientRefreshInterval]);

  if (!isOpen) return null;

  const handleSave = async () => {
    await Promise.all([
      updateChains(editingChains),
      updatePairs(editingPairs),
    ]);
    updateClientRefreshInterval(editingInterval);
    onClose();
  };

  const handleExportConfig = () => {
    const payload = {
      chains: editingChains,
      pairs: editingPairs,
      clientRefreshInterval: editingInterval
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stablejet-config-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportConfig = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
      if (!parsed.chains || !parsed.pairs) throw new Error('Missing chains/pairs');

      setEditingChains(parsed.chains);
      setEditingPairs(parsed.pairs);
      if (typeof parsed.clientRefreshInterval === 'number') {
        setEditingInterval(parsed.clientRefreshInterval);
      }
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // --- Chain Handlers ---
  const handleAddChain = () => {
    if (!newChainId || !newChainName) {
      alert('Chain ID and Name are required');
      return;
    }
    if (editingChains[newChainId]) {
      alert('Chain ID already exists');
      return;
    }
    setEditingChains({
      ...editingChains,
      [newChainId]: {
        name: newChainName,
        kyberCode: newKyberCode || undefined,
        nordsternCode: newNordsternCode || undefined,
        lifiChainId: newLiFiChainId || undefined
      }
    });
    setNewChainId(''); setNewChainName(''); setNewKyberCode(''); setNewNordsternCode(''); setNewLiFiChainId('');
  };

  const handleRemoveChain = (id: string) => {
    const next = { ...editingChains };
    delete next[id];
    setEditingChains(next);
  };

  const handleUpdateChain = (id: string, field: keyof ChainAppConfig, value: any) => {
    setEditingChains({
      ...editingChains,
      [id]: {
        ...editingChains[id],
        [field]: value
      }
    });
  };

  // --- Pair Handlers ---
  const handleAddPair = () => {
    if (!newPairId || !newPairName || !newPairTokenA || !newPairTokenB) {
      alert('All Pair fields are required');
      return;
    }
    if (editingPairs[newPairId]) {
      alert('Pair ID already exists');
      return;
    }
    setEditingPairs({
      ...editingPairs,
      [newPairId]: {
        id: newPairId,
        name: newPairName,
        tokenA: newPairTokenA,
        tokenB: newPairTokenB,
        amounts: [],
        chains: {}
      }
    });
    setNewPairId(''); setNewPairName(''); setNewPairTokenA(''); setNewPairTokenB('');
  };

  const handleRemovePair = (id: string) => {
    const next = { ...editingPairs };
    delete next[id];
    setEditingPairs(next);
    if (activePairId === id) setActivePairId(null);
  };

  // --- Deep Pair Config Handlers ---

  const handleUpdatePairAmount = (pairId: string, action: 'add' | 'remove', value: number) => {
    const pair = editingPairs[pairId];
    let newAmounts = pair.amounts || [];
    if (action === 'add') {
      if (!newAmounts.includes(value)) newAmounts = [...newAmounts, value].sort((a, b) => a - b);
    } else {
      newAmounts = newAmounts.filter(a => a !== value);
    }
    setEditingPairs({
      ...editingPairs,
      [pairId]: {
        ...pair,
        amounts: newAmounts
      }
    });
  };

  const handleUpdatePairChain = (pairId: string, chainId: string, field: 'addressA' | 'addressB' | 'cexPairSymbol' | 'disabled', value: any) => {
    const pair = editingPairs[pairId];
    const chainConfig = pair.chains[chainId] || { addressA: '', addressB: '' };

    const newChainConfig = { ...chainConfig, [field]: value };

    // If disabled is unchecked (false), ensure we keep the object.
    // If addressA/B empty, maybe we should remove it? No, keep it empty.

    setEditingPairs({
      ...editingPairs,
      [pairId]: {
        ...pair,
        chains: {
          ...pair.chains,
          [chainId]: newChainConfig
        }
      }
    });
  };

  const handleTogglePairChain = (pairId: string, chainId: string) => {
    const pair = editingPairs[pairId];
    const exists = !!pair.chains[chainId];
    if (exists) {
      // Toggle implicit disable or remove?
      // Since structure is Record<chainId, Config>, removal means disabled/not configured.
      const nextChains = { ...pair.chains };
      delete nextChains[chainId];
      setEditingPairs({ ...editingPairs, [pairId]: { ...pair, chains: nextChains } });
    } else {
      // Enable (Add empty)
      setEditingPairs({
        ...editingPairs,
        [pairId]: {
          ...pair,
          chains: { ...pair.chains, [chainId]: { addressA: '', addressB: '' } }
        }
      });
    }
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-gray-800">System Configuration</h2>
            <p className="text-sm text-gray-500">Manage Chains, Data Sources, and Trading Pairs</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer">
              Import JSON
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => handleImportConfig(e.target.files?.[0] || null)}
              />
            </label>
            <button
              onClick={handleExportConfig}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Export JSON
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl font-light">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Sidebar: Navigation & Pairs List */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Global Settings</h3>
              <button
                onClick={() => setActivePairId(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activePairId === null ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                Chains & Sources
              </button>
            </div>

            <div className="p-4 flex-1">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trading Pairs</h3>
                <button onClick={handleAddPair} className="text-blue-600 hover:text-blue-800 text-xs font-bold">+ New</button>
              </div>
              {/* Add Pair Form if needed, or just modal? Let's put inputs here for simplicity */}
              <div className="mb-4 space-y-2 bg-white p-2 rounded border border-gray-200 shadow-sm">
                <input placeholder="ID (usdc_usdt)" value={newPairId} onChange={e => setNewPairId(e.target.value)} className="w-full text-xs border rounded px-2 py-1" />
                <input placeholder="Name (USDC/USDT)" value={newPairName} onChange={e => setNewPairName(e.target.value)} className="w-full text-xs border rounded px-2 py-1" />
                <div className="flex gap-1">
                  <input placeholder="A (USDC)" value={newPairTokenA} onChange={e => setNewPairTokenA(e.target.value)} className="w-1/2 text-xs border rounded px-2 py-1" />
                  <input placeholder="B (USDT)" value={newPairTokenB} onChange={e => setNewPairTokenB(e.target.value)} className="w-1/2 text-xs border rounded px-2 py-1" />
                </div>
                <button onClick={handleAddPair} className="w-full bg-blue-600 text-white text-xs rounded py-1 font-semibold">Add</button>
              </div>

              <div className="space-y-1">
                {Object.values(editingPairs).map(pair => (
                  <div key={pair.id} className="flex gap-1 group">
                    <button
                      onClick={() => setActivePairId(pair.id)}
                      className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${activePairId === pair.id ? 'bg-white shadow-sm border border-gray-200 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      {pair.name}
                    </button>
                    <button onClick={() => handleRemovePair(pair.id)} className="text-red-400 hover:text-red-600 px-2 opacity-0 group-hover:opacity-100">×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-8">
            {activePairId === null ? (
              // Chains View
              <div className="max-w-3xl mx-auto">
                <h3 className="text-xl font-bold text-gray-800 mb-6">Chains & Data Sources</h3>

                <div className="space-y-4">
                  {Object.entries(editingChains).map(([id, config]) => (
                    <div key={id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <span className="bg-gray-100 text-gray-600 font-mono text-xs px-2 py-1 rounded">{id}</span>
                          <input
                            className="font-semibold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                            value={config.name}
                            onChange={e => handleUpdateChain(id, 'name', e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input type="checkbox" checked={config.disable} onChange={e => handleUpdateChain(id, 'disable', e.target.checked)} />
                            Disable
                          </label>
                          <button onClick={() => handleRemoveChain(id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">Remove</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-6 p-4 bg-gray-50 rounded-lg">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">KyberSwap Slug</label>
                          <input
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                            placeholder={id}
                            value={config.kyberCode || ''}
                            onChange={e => handleUpdateChain(id, 'kyberCode', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Nordstern Chain ID</label>
                          <input
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                            placeholder={id}
                            value={config.nordsternCode || ''}
                            onChange={e => handleUpdateChain(id, 'nordsternCode', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Li.Fi Chain ID</label>
                          <input
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                            placeholder="1"
                            value={config.lifiChainId || ''}
                            onChange={e => handleUpdateChain(id, 'lifiChainId', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Chain */}
                  <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 border-dashed">
                    <h4 className="text-sm font-bold text-blue-800 mb-3">Add New Chain</h4>
                    <div className="grid grid-cols-5 gap-4">
                      <input placeholder="ID (e.g. base)" value={newChainId} onChange={e => setNewChainId(e.target.value)} className="border rounded px-3 py-2 text-sm" />
                      <input placeholder="Name (e.g. Base)" value={newChainName} onChange={e => setNewChainName(e.target.value)} className="border rounded px-3 py-2 text-sm" />
                      <input placeholder="Kyber Code" value={newKyberCode} onChange={e => setNewKyberCode(e.target.value)} className="border rounded px-3 py-2 text-sm" />
                      <input placeholder="Nordstern Chain ID" value={newNordsternCode} onChange={e => setNewNordsternCode(e.target.value)} className="border rounded px-3 py-2 text-sm" />
                      <input placeholder="Li.Fi Chain ID" value={newLiFiChainId} onChange={e => setNewLiFiChainId(e.target.value)} className="border rounded px-3 py-2 text-sm" />
                      <button onClick={handleAddChain} className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-semibold col-span-5 hover:bg-blue-700">Add Chain Configuration</button>
                    </div>
                  </div>
                </div>

                <div className="mt-8 border-t pt-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Client Refresh Interval</h3>
                  <div className="flex items-center gap-3">
                    <input type="number" value={editingInterval} onChange={e => setEditingInterval(parseInt(e.target.value))} className="border rounded px-3 py-2 w-24" />
                    <span className="text-gray-600">seconds</span>
                  </div>
                </div>
              </div>
            ) : (
              // Pair Edit View
              <div className="max-w-4xl mx-auto">
                {editingPairs[activePairId] && (
                  <>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">{editingPairs[activePairId].name}</h2>
                        <p className="text-gray-500 font-mono text-sm">{activePairId}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Token A: <span className="font-bold text-gray-900">{editingPairs[activePairId].tokenA}</span></div>
                        <div className="text-sm text-gray-500">Token B: <span className="font-bold text-gray-900">{editingPairs[activePairId].tokenB}</span></div>
                      </div>
                    </div>

                    {/* Amounts Config */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
                      <h3 className="text-md font-bold text-gray-800 mb-4">Test Amounts</h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {editingPairs[activePairId].amounts.map(amt => (
                          <span key={amt} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 border border-blue-100">
                            {amt.toLocaleString()}
                            <button onClick={() => handleUpdatePairAmount(activePairId, 'remove', amt)} className="hover:text-red-500">×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2 max-w-xs">
                        <input
                          type="number"
                          placeholder="Add Amount"
                          value={newAmount}
                          onChange={e => setNewAmount(e.target.value)}
                          className="flex-1 border rounded px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => {
                            const val = parseFloat(newAmount);
                            if (val > 0) {
                              handleUpdatePairAmount(activePairId, 'add', val);
                              setNewAmount('');
                            }
                          }}
                          className="bg-gray-900 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Chain Addresses Config */}
                    <div className="space-y-4">
                      <h3 className="text-md font-bold text-gray-800">Chain Configurations</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {Object.keys(editingChains).filter(id => !editingChains[id].disable).map(chainId => {
                          const isConfigured = !!editingPairs[activePairId].chains[chainId];
                          const config = editingPairs[activePairId].chains[chainId] || { addressA: '', addressB: '' };
                          const isCex = ['binance', 'mexc', 'bybit'].includes(chainId);

                          return (
                            <div key={chainId} className={`p-4 rounded-xl border transition-all ${isConfigured ? 'bg-white border-blue-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-70 hover:opacity-100'}`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center cursor-pointer ${isConfigured ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400'}`} onClick={() => handleTogglePairChain(activePairId, chainId)}>
                                    {isConfigured && <span className="text-white text-xs">✓</span>}
                                  </div>
                                  <span className="font-bold text-gray-700">{editingChains[chainId].name}</span>
                                </div>
                              </div>

                              {isConfigured && (
                                <div className="grid grid-cols-2 gap-4 ml-7">
                                  {isCex ? (
                                    <div className="col-span-2">
                                      <label className="block text-xs text-gray-500 mb-1">CEX Pair Symbol</label>
                                      <input
                                        className="w-full text-xs font-mono border rounded px-3 py-2 bg-gray-50 focus:bg-white"
                                        value={(config as any).cexPairSymbol || ''}
                                        onChange={e => handleUpdatePairChain(activePairId, chainId, 'cexPairSymbol', e.target.value)}
                                        placeholder="USDCUSDT"
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="block text-xs text-gray-500 mb-1">{editingPairs[activePairId].tokenA} Address</label>
                                        <input
                                          className="w-full text-xs font-mono border rounded px-3 py-2 bg-gray-50 focus:bg-white"
                                          value={config.addressA}
                                          onChange={e => handleUpdatePairChain(activePairId, chainId, 'addressA', e.target.value)}
                                          placeholder="0x..."
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-gray-500 mb-1">{editingPairs[activePairId].tokenB} Address</label>
                                        <input
                                          className="w-full text-xs font-mono border rounded px-3 py-2 bg-gray-50 focus:bg-white"
                                          value={config.addressB}
                                          onChange={e => handleUpdatePairChain(activePairId, chainId, 'addressB', e.target.value)}
                                          placeholder="0x..."
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl shrink-0">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 shadow-sm">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-sm">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
