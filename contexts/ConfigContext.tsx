'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChainConfig } from '@/lib/types';
import { USDT_USDC_CHAINS as DEFAULT_CHAINS, AMOUNTS as DEFAULT_AMOUNTS, DEFAULT_TRADING_PAIR } from '@/lib/config';

const DEFAULT_CLIENT_REFRESH_INTERVAL = 10; // 默认客户端刷新间隔10秒

interface ConfigContextType {
  chains: Record<string, ChainConfig>;
  amounts: number[];
  clientRefreshInterval: number; // 客户端刷新显示的间隔（秒）
  selectedPair: string; // 当前选中的交易对
  updateChains: (chains: Record<string, ChainConfig>) => void;
  updateAmounts: (amounts: number[]) => void;
  updateClientRefreshInterval: (interval: number) => void;
  updateSelectedPair: (pairId: string) => void;
  resetToDefaults: () => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [chains, setChains] = useState<Record<string, ChainConfig>>(DEFAULT_CHAINS);
  const [amounts, setAmounts] = useState<number[]>(DEFAULT_AMOUNTS);
  const [clientRefreshInterval, setClientRefreshInterval] = useState<number>(DEFAULT_CLIENT_REFRESH_INTERVAL);
  const [selectedPair, setSelectedPair] = useState<string>(DEFAULT_TRADING_PAIR);
  const [isLoaded, setIsLoaded] = useState(false);

  // 从 localStorage 加载配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedChains = localStorage.getItem('stablejet_chains');
        const savedAmounts = localStorage.getItem('stablejet_amounts');
        const savedClientRefreshInterval = localStorage.getItem('stablejet_client_refresh_interval');
        const savedSelectedPair = localStorage.getItem('stablejet_selected_pair');

        if (savedChains) {
          setChains(JSON.parse(savedChains));
        }
        if (savedAmounts) {
          setAmounts(JSON.parse(savedAmounts));
        }
        if (savedClientRefreshInterval) {
          setClientRefreshInterval(JSON.parse(savedClientRefreshInterval));
        }
        if (savedSelectedPair) {
          setSelectedPair(savedSelectedPair);
        }
      } catch (error) {
        console.error('Failed to load config from localStorage:', error);
      } finally {
        setIsLoaded(true);
      }
    }
  }, []);

  // 保存配置到 localStorage
  const updateChains = (newChains: Record<string, ChainConfig>) => {
    setChains(newChains);
    if (typeof window !== 'undefined') {
      localStorage.setItem('stablejet_chains', JSON.stringify(newChains));
    }
  };

  const updateAmounts = (newAmounts: number[]) => {
    setAmounts(newAmounts);
    if (typeof window !== 'undefined') {
      localStorage.setItem('stablejet_amounts', JSON.stringify(newAmounts));
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
  };

  const resetToDefaults = () => {
    setChains(DEFAULT_CHAINS);
    setAmounts(DEFAULT_AMOUNTS);
    setClientRefreshInterval(DEFAULT_CLIENT_REFRESH_INTERVAL);
    setSelectedPair(DEFAULT_TRADING_PAIR);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('stablejet_chains');
      localStorage.removeItem('stablejet_amounts');
      localStorage.removeItem('stablejet_client_refresh_interval');
      localStorage.removeItem('stablejet_selected_pair');
    }
  };

  // 等待加载完成后再渲染子组件，避免闪烁
  if (!isLoaded) {
    return null;
  }

  return (
    <ConfigContext.Provider
      value={{
        chains,
        amounts,
        clientRefreshInterval,
        selectedPair,
        updateChains,
        updateAmounts,
        updateClientRefreshInterval,
        updateSelectedPair,
        resetToDefaults,
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
