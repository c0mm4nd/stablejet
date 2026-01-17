'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ChainAppConfig, TradingPairConfig, ConfigData } from '@/lib/types';

const DEFAULT_CLIENT_REFRESH_INTERVAL = 10; // 默认客户端刷新间隔10秒

interface ConfigContextType {
  chains: Record<string, ChainAppConfig>;
  pairs: Record<string, TradingPairConfig>;
  clientRefreshInterval: number; // 客户端刷新显示的间隔（秒）
  selectedPair: string; // 当前选中的交易对
  updateChains: (chains: Record<string, ChainAppConfig>) => Promise<void>;
  updatePairs: (pairs: Record<string, TradingPairConfig>) => Promise<void>;
  updateClientRefreshInterval: (interval: number) => void;
  updateSelectedPair: (pairId: string) => void;
  resetToDefaults: () => void;
  isLoadingConfig: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [chains, setChains] = useState<Record<string, ChainAppConfig>>({});
  const [pairs, setPairs] = useState<Record<string, TradingPairConfig>>({});
  const [clientRefreshInterval, setClientRefreshInterval] = useState<number>(DEFAULT_CLIENT_REFRESH_INTERVAL);
  const [selectedPair, setSelectedPair] = useState<string>('');

  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // Fetch Config from API
  const fetchConfig = useCallback(async () => {
    try {
      setIsLoadingConfig(true);
      const res = await fetch('/api/config');
      if (res.ok) {
        const data: ConfigData = await res.json();
        setChains(data.chains);
        setPairs(data.pairs);
        if (!selectedPair) {
          const firstPairId = Object.keys(data.pairs || {})[0];
          if (firstPairId) {
            setSelectedPair(firstPairId);
            if (typeof window !== 'undefined') {
              localStorage.setItem('stablejet_selected_pair', firstPairId);
            }
          }
        }
      } else {
        console.error('Failed to fetch config');
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadLocalSettings = () => {
        try {
          const savedClientRefreshInterval = localStorage.getItem('stablejet_client_refresh_interval');
          const savedSelectedPair = localStorage.getItem('stablejet_selected_pair');

          if (savedClientRefreshInterval) {
            setClientRefreshInterval(JSON.parse(savedClientRefreshInterval));
          }
          if (savedSelectedPair) {
            setSelectedPair(savedSelectedPair);
            // Best-effort sync for server-side background fetcher
            fetch('/api/background/active-pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pairId: savedSelectedPair })
            }).catch(() => {});
          }
        } catch (error) {
          console.error('Failed to load local settings:', error);
        }
      };

      loadLocalSettings();
      fetchConfig().then(() => setIsLoaded(true));
    }
  }, [fetchConfig]);

  // Update Chains (Persist to Server)
  const updateChains = async (newChains: Record<string, ChainAppConfig>) => {
    setChains(newChains);
    try {
      const res = await fetch('/api/config');
      const currentConfig: ConfigData = await res.json();

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentConfig,
          chains: newChains
        })
      });
    } catch (err) {
      console.error('Failed to save chains:', err);
      fetchConfig();
    }
  };

  const updatePairs = async (newPairs: Record<string, TradingPairConfig>) => {
    setPairs(newPairs);
    try {
      const res = await fetch('/api/config');
      const currentConfig: ConfigData = await res.json();

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentConfig,
          pairs: newPairs
        })
      });
    } catch (err) {
      console.error('Failed to save pairs:', err);
      fetchConfig();
    }
  };

  const updateClientRefreshInterval = (interval: number) => {
    setClientRefreshInterval(interval);
    if (typeof window !== 'undefined') {
      localStorage.setItem('stablejet_client_refresh_interval', JSON.stringify(interval));
    }
  };

  const updateSelectedPair = (pairId: string) => {
    setSelectedPair(pairId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('stablejet_selected_pair', pairId);
    }
    fetch('/api/background/active-pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId })
    }).catch(() => {});
  };

  const resetToDefaults = () => {
    alert("Reset feature is disabled in dynamic mode.");
  };

  if (!isLoaded) return null;

  return (
    <ConfigContext.Provider
      value={{
        chains,
        pairs,
        clientRefreshInterval,
        selectedPair,
        updateChains,
        updatePairs,
        updateClientRefreshInterval,
        updateSelectedPair,
        resetToDefaults,
        isLoadingConfig,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
