'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HistoryDataPoint } from '@/lib/history';
import { calculateImpliedRate, calculateMedian, calculateRateDeviationBps, filterOutliers } from '@/lib/utils';
import { useConfig } from '@/contexts/ConfigContext';

interface SpreadLineChartProps {
  history: HistoryDataPoint[];
  amount: number;
  pairId?: string; // 添加 pairId 参数
}

// 链标识符到显示名称的映射
const CHAIN_DISPLAY_NAMES: Record<string, string> = {
  'ethereum': 'Ethereum',
  'polygon': 'Polygon',
  'arbitrum': 'Arbitrum',
  'optimism': 'Optimism',
  'base': 'Base',
  'bsc': 'BSC',
  'avalanche': 'Avalanche',
  'hyperevm': 'HyperEVM',
  'monad': 'Monad',
  'sonic': 'Sonic',
  'etherlink': 'Etherlink',
  'mantle': 'Mantle (USDC/USDT)',
  'mantle_0': 'Mantle (USDC/USDT0)',
  'unichain': 'UniChain',
  'berachain': 'Berachain',
  'binance': 'Binance (CEX)',
  'mexc': 'MEXC (CEX)',
  'bybit': 'Bybit (CEX)',
};

// USDC → USDT 使用蓝色系（冷色调）
const USDC_TO_USDT_COLORS: Record<string, string> = {
  'ethereum': '#3B82F6',      // 蓝色
  'polygon': '#8B5CF6',       // 紫色
  'arbitrum': '#06B6D4',      // 青色
  'optimism': '#6366F1',      // 靛蓝
  'base': '#0EA5E9',          // 天蓝
  'bsc': '#14B8A6',           // 青绿
  'avalanche': '#0284C7',     // 深蓝
  'hyperevm': '#0891B2',      // 蓝绿
  'monad': '#4F46E5',         // 深靛蓝
  'sonic': '#2563EB',         // 皇家蓝
  'etherlink': '#7C3AED',     // 深紫
  'mantle': '#059669',        // 祖母绿
  'unichain': '#1D4ED8',      // 宝蓝
  'berachain': '#0D9488',     // 水鸭青
  'binance': '#F0B90B',       // Binance 金色
  'mexc': '#00C087',          // MEXC 绿色
  'bybit': '#F7A600',         // Bybit 橙色
};

// USDT → USDC 使用橙/红色系（暖色调）
const USDT_TO_USDC_COLORS: Record<string, string> = {
  'ethereum': '#F59E0B',      // 琥珀色
  'polygon': '#EF4444',       // 红色
  'arbitrum': '#F97316',      // 橙色
  'optimism': '#EC4899',      // 粉红
  'base': '#FB923C',          // 橙黄
  'bsc': '#FBBF24',           // 黄色
  'avalanche': '#DC2626',     // 深红
  'hyperevm': '#EA580C',      // 深橙
  'monad': '#BE123C',         // 玫瑰红
  'sonic': '#D97706',         // 金橙
  'etherlink': '#DB2777',     // 洋红
  'mantle': '#CA8A04',        // 金黄
  'unichain': '#C2410C',      // 砖红
  'berachain': '#B45309',     // 棕橙
  'binance': '#E8A317',       // Binance 暖金色
  'mexc': '#009966',          // MEXC 深绿
  'bybit': '#E89500',         // Bybit 深橙
};

// 自定义 Tooltip 组件
const CustomTooltip = ({ active, payload, label, pairConfig }: any) => {
  if (!active || !payload || !payload.length || !pairConfig) return null;

  const { tokenA, tokenB } = pairConfig;

  // 按方向分组
  const tokenAToB = payload.filter((p: any) => p.dataKey.includes(`(${tokenA}→${tokenB})`));
  const tokenBToA = payload.filter((p: any) => p.dataKey.includes(`(${tokenB}→${tokenA})`));

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[280px]">
      <p className="font-semibold text-gray-800 mb-3 text-sm border-b pb-2">{label}</p>

      {tokenAToB.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-blue-600 mb-1">{tokenA} → {tokenB}</p>
          <div className="space-y-1">
            {tokenAToB.map((entry: any) => (
              <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="font-medium text-gray-700 min-w-[70px]">
                  {entry.name}:
                </span>
                {entry.value !== null && entry.value !== undefined ? (
                  <span className={`font-bold ${entry.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.value.toFixed(2)} bps
                  </span>
                ) : (
                  <span className="font-bold text-gray-400">N/A</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tokenBToA.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-orange-600 mb-1">{tokenB} → {tokenA}</p>
          <div className="space-y-1">
            {tokenBToA.map((entry: any) => (
              <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="font-medium text-gray-700 min-w-[70px]">
                  {entry.name}:
                </span>
                {entry.value !== null && entry.value !== undefined ? (
                  <span className={`font-bold ${entry.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.value.toFixed(2)} bps
                  </span>
                ) : (
                  <span className="font-bold text-gray-400">N/A</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ... (existing constants)

export default function SpreadLineChart({ history, amount, pairId }: SpreadLineChartProps) {
  const { pairs } = useConfig();
  const pair = pairId ? pairs[pairId] : undefined;

  if (!pair) return null;

  const tokenAShort = pair.tokenA;
  const tokenBShort = pair.tokenB;

  // 每个时间点的“基准汇率”（使用该时间点全体链/数据源的中位数）
  const baselineByTimestamp: Record<string, { aToB: number | null; bToA: number | null }> = {};
  history.forEach(point => {
    const amountItems = point.data.filter(item => item.amount === amount);
    const ratesAToB = amountItems
      .map(item => {
        const quote = item.tokenAToB || item.usdcToUsdt;
        return calculateImpliedRate(quote.input, quote.output);
      })
      .filter((r): r is number => r !== null);
    const ratesBToA = amountItems
      .map(item => {
        const quote = item.tokenBToA || item.usdtToUsdc;
        return calculateImpliedRate(quote.input, quote.output);
      })
      .filter((r): r is number => r !== null);

    baselineByTimestamp[point.timestamp] = {
      aToB: ratesAToB.length > 0 ? calculateMedian(ratesAToB) : null,
      bToA: ratesBToA.length > 0 ? calculateMedian(ratesBToA) : null,
    };
  });

  const seriesBases = Array.from(
    new Set(
      history
        .flatMap(point => point.data)
        .filter(item => item.amount === amount)
        .map(item => `${item.chainKey}@${item.dataSource || 'kyberswap'}`)
    )
  ).sort();

  const sourceSuffix = (source: string) => (source === 'nordstern' ? 'NS' : 'KS');
  const splitBase = (base: string) => {
    const [chainKey, dataSource] = base.split('@');
    return { chainKey, dataSource: dataSource || 'kyberswap' };
  };

  // 首先收集所有价差值用于计算中位数
  const allSpreads: { [key: string]: (number | null)[] } = {};
  seriesBases.forEach(base => {
    allSpreads[`${base} (${tokenAShort}→${tokenBShort})`] = [];
    allSpreads[`${base} (${tokenBShort}→${tokenAShort})`] = [];
  });

  // 收集所有价差值
  history.forEach(point => {
    point.data
      .filter(item => item.amount === amount)
      .forEach(item => {
        const base = `${item.chainKey}@${item.dataSource || 'kyberswap'}`;
        const tokenAToB = item.tokenAToB || item.usdcToUsdt;
        const tokenBToA = item.tokenBToA || item.usdtToUsdc;

        const baseline = baselineByTimestamp[point.timestamp] || { aToB: null, bToA: null };
        const tokenAToBRate = calculateImpliedRate(tokenAToB.input, tokenAToB.output);
        const tokenBToARate = calculateImpliedRate(tokenBToA.input, tokenBToA.output);
        const tokenAToBSpread = calculateRateDeviationBps(tokenAToBRate, baseline.aToB);
        const tokenBToASpread = calculateRateDeviationBps(tokenBToARate, baseline.bToA);

        // 确保数组已初始化（处理配置中有但颜色定义中没有的链）
        if (!allSpreads[`${base} (${tokenAShort}→${tokenBShort})`]) {
          allSpreads[`${base} (${tokenAShort}→${tokenBShort})`] = [];
        }
        if (!allSpreads[`${base} (${tokenBShort}→${tokenAShort})`]) {
          allSpreads[`${base} (${tokenBShort}→${tokenAShort})`] = [];
        }

        allSpreads[`${base} (${tokenAShort}→${tokenBShort})`].push(tokenAToBSpread);
        allSpreads[`${base} (${tokenBShort}→${tokenAShort})`].push(tokenBToASpread);
      });
  });

  // 转换数据格式供 Recharts 使用，并过滤异常值
  const chartData = history.map(point => {
    const timestamp = new Date(point.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const dataPoint: any = { timestamp };

    // 为每条链添加两个方向的数据
    point.data
      .filter(item => item.amount === amount)
      .forEach(item => {
        const base = `${item.chainKey}@${item.dataSource || 'kyberswap'}`;

        // 使用通用字段或回退到 USDC/USDT 字段
        const tokenAToB = item.tokenAToB || item.usdcToUsdt;
        const tokenBToA = item.tokenBToA || item.usdtToUsdc;

        const baseline = baselineByTimestamp[point.timestamp] || { aToB: null, bToA: null };

        // TokenA → TokenB
        const tokenAToBRate = calculateImpliedRate(tokenAToB.input, tokenAToB.output);
        const tokenAToBSpread = calculateRateDeviationBps(tokenAToBRate, baseline.aToB);
        const filteredTokenAToB = filterOutliers(
          tokenAToBSpread !== null ? parseFloat(tokenAToBSpread.toFixed(2)) : null,
          allSpreads[`${base} (${tokenAShort}→${tokenBShort})`],
          10
        );
        dataPoint[`${base} (${tokenAShort}→${tokenBShort})`] = filteredTokenAToB;

        // TokenB → TokenA
        const tokenBToARate = calculateImpliedRate(tokenBToA.input, tokenBToA.output);
        const tokenBToASpread = calculateRateDeviationBps(tokenBToARate, baseline.bToA);
        const filteredTokenBToA = filterOutliers(
          tokenBToASpread !== null ? parseFloat(tokenBToASpread.toFixed(2)) : null,
          allSpreads[`${base} (${tokenBShort}→${tokenAShort})`],
          10
        );
        dataPoint[`${base} (${tokenBShort}→${tokenAShort})`] = filteredTokenBToA;
      });

    return dataPoint;
  });


  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        {amount.toLocaleString()} {tokenAShort} - 双向报价偏差 (bps) ({pair?.name || 'USDC/USDT'})
      </h2>

      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            stroke="#9ca3af"
            style={{ fontSize: '11px' }}
          />
          <YAxis
            stroke="#9ca3af"
            style={{ fontSize: '11px' }}
            label={{ value: '报价偏差 (bps)', angle: -90, position: 'insideLeft', style: { fontSize: '11px' } }}
          />
          <Tooltip content={<CustomTooltip pairConfig={pair} />} />
          <Legend
            wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
            iconType="line"
          />

          {/* TokenA → TokenB 线条（蓝色系） */}
          {seriesBases.map(base => {
            const { chainKey, dataSource } = splitBase(base);
            const palette = Object.values(USDC_TO_USDT_COLORS);
            const stroke = USDC_TO_USDT_COLORS[chainKey] || palette[Math.abs(chainKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length];

            return (
              <Line
                key={`${base}-tokena-tokenb`}
                type="monotone"
                dataKey={`${base} (${tokenAShort}→${tokenBShort})`}
                name={`${CHAIN_DISPLAY_NAMES[chainKey] || chainKey} [${sourceSuffix(dataSource)}] (${tokenAShort}→${tokenBShort})`}
                stroke={stroke}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
                connectNulls
              />
            );
          })}

          {/* TokenB → TokenA 线条（橙/红色系） */}
          {seriesBases.map(base => {
            const { chainKey, dataSource } = splitBase(base);
            const palette = Object.values(USDT_TO_USDC_COLORS);
            const stroke = USDT_TO_USDC_COLORS[chainKey] || palette[Math.abs(chainKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length];

            return (
              <Line
                key={`${base}-tokenb-tokena`}
                type="monotone"
                dataKey={`${base} (${tokenBShort}→${tokenAShort})`}
                name={`${CHAIN_DISPLAY_NAMES[chainKey] || chainKey} [${sourceSuffix(dataSource)}] (${tokenBShort}→${tokenAShort})`}
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 6 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-blue-500"></div>
            <span className="text-gray-700">{pair.tokenA} → {pair.tokenB}（蓝色系）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-orange-500 border-t-2 border-dashed border-orange-500"></div>
            <span className="text-gray-700">{pair.tokenB} → {pair.tokenA}（橙色系，虚线）</span>
          </div>
        </div>
        <p className="text-xs text-gray-600 text-center">
          正值表示获利，负值表示损失 | bps = 基点 (1 bps = 0.01%) | 套利空间 = 两条线的差值
          <br />
          已过滤超出中位数 ±10 bps 的异常值
        </p>
      </div>
    </div>
  );
}
