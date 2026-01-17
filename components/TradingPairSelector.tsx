'use client';

import { useConfig } from '@/contexts/ConfigContext';

interface TradingPairSelectorProps {
  selectedPair: string;
  onPairChange: (pairId: string) => void;
}

export default function TradingPairSelector({ selectedPair, onPairChange }: TradingPairSelectorProps) {
  const { pairs: pairsConfig } = useConfig();
  const pairs = Object.values(pairsConfig);

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {pairs.map((pair, index) => (
        <button
          key={pair.id}
          onClick={() => onPairChange(pair.id)}
          className={`relative px-8 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${selectedPair === pair.id
              ? 'bg-white text-blue-600 shadow-xl shadow-blue-500/20 scale-105'
              : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            }`}
        >
          <span className="relative z-10">{pair.name}</span>
          {selectedPair === pair.id && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-indigo-400/20 rounded-xl"></div>
          )}
        </button>
      ))}
    </div>
  );
}
