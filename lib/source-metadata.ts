import { ConfigData, DataSource } from './types';

export const DEFAULT_SOURCES: ConfigData['sources'] = {
  kyberswap: true,
  nordstern: true,
  lifi: true,
  zerox: true,
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
  kraken: true
};

export const SOURCE_INFO: Record<DataSource, { name: string; color: string; shortName: string }> = {
  kyberswap: { name: 'KyberSwap', color: 'text-blue-600', shortName: 'KS' },
  nordstern: { name: 'Nordstern', color: 'text-cyan-600', shortName: 'NS' },
  lifi: { name: 'Li.Fi', color: 'text-teal-600', shortName: 'LF' },
  zerox: { name: '0x', color: 'text-purple-600', shortName: '0X' },
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
  kraken: { name: 'Kraken', color: 'text-slate-600', shortName: 'KR' }
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
  const normalized = (source || 'kyberswap').toLowerCase() as DataSource;
  return SOURCE_INFO[normalized] || {
    name: source || 'kyberswap',
    color: 'text-gray-600',
    shortName: (source || 'kyberswap').slice(0, 2).toUpperCase()
  };
}

export function getSourceSuffix(source?: string) {
  return getSourceInfo(source).shortName;
}
