import { ConfigData, DataSource } from './types';

export const DEFAULT_SOURCES: ConfigData['sources'] = {
  llamaswap: true,
  lifi: true,
  cetus: true,
  jupiter: true,
  panora: true,
  aftermath: false,
  binance: true,
  bybit: true,
  mexc: true,
  bitget: true,
  gate: true,
  htx: true,
  kraken: true,
  okx: true
};

export const SOURCE_INFO: Record<DataSource, { name: string; color: string; shortName: string }> = {
  llamaswap: { name: 'LlamaSwap', color: 'text-teal-600', shortName: 'LS' },
  lifi: { name: 'Li.Fi', color: 'text-teal-600', shortName: 'LF' },
  cetus: { name: 'Cetus', color: 'text-sky-700', shortName: 'CT' },
  jupiter: { name: 'Jupiter', color: 'text-fuchsia-600', shortName: 'JP' },
  panora: { name: 'Panora', color: 'text-violet-600', shortName: 'PN' },
  aftermath: { name: 'Aftermath', color: 'text-emerald-600', shortName: 'AF' },
  binance: { name: 'Binance', color: 'text-yellow-600', shortName: 'BN' },
  bybit: { name: 'Bybit', color: 'text-orange-600', shortName: 'BY' },
  mexc: { name: 'MEXC', color: 'text-green-600', shortName: 'MX' },
  bitget: { name: 'Bitget', color: 'text-sky-600', shortName: 'BG' },
  gate: { name: 'Gate.io', color: 'text-indigo-600', shortName: 'GT' },
  htx: { name: 'HTX', color: 'text-rose-600', shortName: 'HX' },
  kraken: { name: 'Kraken', color: 'text-slate-600', shortName: 'KR' },
  okx: { name: 'OKX', color: 'text-gray-900', shortName: 'OX' }
};

export function normalizeSources(
  sources?: Partial<ConfigData['sources']> | null
): ConfigData['sources'] {
  return {
    ...DEFAULT_SOURCES,
    ...(sources || {})
  };
}

export function getSourceInfo(source?: string) {
  const toolPrefix = ['llamaswap/', 'lifi/', 'pool/'].find(prefix => source?.startsWith(prefix));
  if (source && toolPrefix) {
    const toolName = source.slice(toolPrefix.length);
    return {
      name: toolName,
      color: 'text-teal-600',
      shortName: toolName.slice(0, 2).toUpperCase()
    };
  }
  const normalized = (source || 'unknown').toLowerCase() as DataSource;
  return SOURCE_INFO[normalized] || {
    name: source || 'unknown',
    color: 'text-gray-600',
    shortName: (source || '??').slice(0, 2).toUpperCase()
  };
}

export function getSourceSuffix(source?: string) {
  return getSourceInfo(source).shortName;
}
