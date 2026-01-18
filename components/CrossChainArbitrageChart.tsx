'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HistoryDataPoint } from '@/lib/history';
import { useConfig } from '@/contexts/ConfigContext';
import { calculateImpliedRate, calculateMedian, calculateRateDeviationBps, calculateRoundTripBps, filterOutliers, isSourceEnabled } from '@/lib/utils';

interface CrossChainArbitrageChartProps {
  history: HistoryDataPoint[];
  amount: number;
  pairId: string;
}

// 链对的颜色映射（选择对比度高的颜色）
const CHAIN_PAIR_COLORS: string[] = [
  '#3B82F6', // 蓝色
  '#EF4444', // 红色
  '#10B981', // 绿色
  '#F59E0B', // 琥珀色
  '#8B5CF6', // 紫色
  '#EC4899', // 粉红
  '#06B6D4', // 青色
  '#F97316', // 橙色
  '#14B8A6', // 青绿
  '#6366F1', // 靛蓝
  '#F43F5E', // 玫瑰红
  '#84CC16', // 石灰绿
  '#A855F7', // 紫罗兰
  '#22D3EE', // 天蓝
  '#FB7185', // 粉色
  '#FACC15', // 黄色
  '#2DD4BF', // 青色
  '#818CF8', // 靛蓝
  '#FB923C', // 橙色
  '#4ADE80', // 绿色
];

// 自定义 Tooltip 组件
const CustomTooltip = ({ active, payload, label, detailsMap }: any) => {
  if (!active || !payload || !payload.length) return null;

  // 按收益排序，只显示前8个
  const sortedPayload = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
  const displayPayload = sortedPayload.slice(0, 8);
  const hasMore = sortedPayload.length > 8;

  return (
    <div className="bg-white border-2 border-gray-400 rounded-lg shadow-2xl min-w-[440px] max-w-[500px]">
      {/* 标题 */}
      <div className="font-semibold text-gray-800 px-4 pt-3 pb-2 text-sm border-b bg-gray-50 rounded-t-lg">
        {label} {hasMore && <span className="text-gray-500 font-normal">(显示前 8 个)</span>}
      </div>

      {/* 内容区域 - 紧凑布局 */}
      <div className="px-3 py-2 space-y-2">
        {displayPayload.map((entry: any) => {
          const detail = detailsMap?.[entry.dataKey];

          return (
            <div key={entry.dataKey} className="border-l-4 pl-2.5 py-1.5 bg-gray-50 rounded-r" style={{ borderColor: entry.color }}>
              {/* 链对名称和总利润 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-gray-800 text-xs">
                  {entry.dataKey}
                </span>
                <span className={`font-bold text-base ${entry.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {entry.value >= 0 ? '+' : ''}{entry.value.toFixed(2)} bps
                </span>
              </div>

              {/* 详细路径 - 横向布局 */}
              {detail && (
                <div className="text-[11px] space-y-1">
                  {/* 方向 */}
                  <div className="font-semibold text-purple-700 text-xs mb-1">
                    {detail.direction}
                  </div>

                  {/* 步骤1和2横向排列 */}
                  <div className="flex items-start gap-3">
                    {/* 步骤1 */}
                    <div className="flex-1 bg-white rounded px-2 py-1">
                      <div className="text-gray-500 mb-0.5">① {detail.step1Chain}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-blue-600 font-medium">{detail.step1Pair}</span>
                        <span className={`font-bold ${detail.step1Bps >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {detail.step1Bps >= 0 ? '+' : ''}{detail.step1Bps}
                        </span>
                      </div>
                    </div>

                    {/* 步骤2 */}
                    <div className="flex-1 bg-white rounded px-2 py-1">
                      <div className="text-gray-500 mb-0.5">② {detail.step2Chain}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-blue-600 font-medium">{detail.step2Pair}</span>
                        <span className={`font-bold ${detail.step2Bps >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {detail.step2Bps >= 0 ? '+' : ''}{detail.step2Bps}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部统计 */}
      <div className="px-4 py-2 text-xs text-gray-500 border-t bg-gray-50 rounded-b-lg flex justify-between">
        <span>共 {sortedPayload.length} 个链对</span>
        {hasMore && <span className="text-orange-600">还有 {sortedPayload.length - 8} 个未显示</span>}
      </div>
    </div>
  );
};

interface ArbitrageDetail {
  profit: number;
  direction: string;
  step1Chain: string;
  step1Pair: string;
  step1Bps: number;
  step2Chain: string;
  step2Pair: string;
  step2Bps: number;
}


export default function CrossChainArbitrageChart({ history, amount, pairId }: CrossChainArbitrageChartProps) {
  const { pairs, sources } = useConfig();
  const sourceSuffix = (source?: string) => {
    if (source === 'nordstern') return 'NS';
    if (source === 'lifi') return 'LF';
    if (source === 'binance') return 'BN';
    if (source === 'bybit') return 'BY';
    if (source === 'mexc') return 'MX';
    return 'KS';
  };
  const itemLabel = (item: any) => `${item.chain} [${sourceSuffix(item.dataSource || 'kyberswap')}]`;

  const pair = pairs[pairId];
  if (!pair) {
    return null;
  }

  // 首先收集所有链对的套利数据
  const chainPairs: { [key: string]: (number | null)[] } = {};
  const chainPairDetails: { [timestamp: string]: { [pairKey: string]: ArbitrageDetail | null } } = {};

  // 收集所有套利值
  history.forEach(point => {
    const amountData = point.data
      .filter(item => item.amount === amount)
      .filter(item => isSourceEnabled(item.dataSource, sources));

    const ratesAtoB = amountData
      .map(item => {
        const tokenAToB = item.tokenAToB;
        return tokenAToB ? calculateImpliedRate(tokenAToB.input, tokenAToB.output) : null;
      })
      .filter((r): r is number => r !== null);
    const ratesBtoA = amountData
      .map(item => {
        const tokenBToA = item.tokenBToA;
        return tokenBToA ? calculateImpliedRate(tokenBToA.input, tokenBToA.output) : null;
      })
      .filter((r): r is number => r !== null);

    const baselineAtoB = ratesAtoB.length > 0 ? calculateMedian(ratesAtoB) : null;
    const baselineBtoA = ratesBtoA.length > 0 ? calculateMedian(ratesBtoA) : null;

    if (!chainPairDetails[point.timestamp]) {
      chainPairDetails[point.timestamp] = {};
    }

    // 计算所有可能的链对组合
    for (let i = 0; i < amountData.length; i++) {
      for (let j = 0; j < amountData.length; j++) {
        if (i === j) continue;

        const buyChain = amountData[i];
        const sellChain = amountData[j];
        const pairKey = `${itemLabel(buyChain)}→${itemLabel(sellChain)}`;

        if (!chainPairs[pairKey]) {
          chainPairs[pairKey] = [];
        }

        const buyAtoB = buyChain.tokenAToB;
        const buyBtoA = buyChain.tokenBToA;
        const sellAtoB = sellChain.tokenAToB;
        const sellBtoA = sellChain.tokenBToA;

        const buyRateAtoB = buyAtoB ? calculateImpliedRate(buyAtoB.input, buyAtoB.output) : null;
        const buyRateBtoA = buyBtoA ? calculateImpliedRate(buyBtoA.input, buyBtoA.output) : null;
        const sellRateAtoB = sellAtoB ? calculateImpliedRate(sellAtoB.input, sellAtoB.output) : null;
        const sellRateBtoA = sellBtoA ? calculateImpliedRate(sellBtoA.input, sellBtoA.output) : null;

        // 方向1: buyChain 做 A→B，然后 sellChain 做 B→A
        const direction1_profit = calculateRoundTripBps(buyRateAtoB, sellRateBtoA);
        // 方向2: buyChain 做 B→A，然后 sellChain 做 A→B
        const direction2_profit = calculateRoundTripBps(buyRateBtoA, sellRateAtoB);

        let bestProfit = null;
        let bestDetail: ArbitrageDetail | null = null;

        if (direction1_profit !== null) {
          bestProfit = direction1_profit;
          bestDetail = {
            profit: direction1_profit,
            direction: `${pair.tokenA}→${pair.tokenB}→${pair.tokenA}`,
            step1Chain: itemLabel(buyChain),
            step1Pair: `${pair.tokenA}→${pair.tokenB}`,
            step1Bps: calculateRateDeviationBps(buyRateAtoB, baselineAtoB) ?? 0,
            step2Chain: itemLabel(sellChain),
            step2Pair: `${pair.tokenB}→${pair.tokenA}`,
            step2Bps: calculateRateDeviationBps(sellRateBtoA, baselineBtoA) ?? 0
          };
        }

        if (direction2_profit !== null) {
          if (bestProfit === null || direction2_profit > bestProfit) {
            bestProfit = direction2_profit;
            bestDetail = {
              profit: direction2_profit,
              direction: `${pair.tokenB}→${pair.tokenA}→${pair.tokenB}`,
              step1Chain: itemLabel(buyChain),
              step1Pair: `${pair.tokenB}→${pair.tokenA}`,
              step1Bps: calculateRateDeviationBps(buyRateBtoA, baselineBtoA) ?? 0,
              step2Chain: itemLabel(sellChain),
              step2Pair: `${pair.tokenA}→${pair.tokenB}`,
              step2Bps: calculateRateDeviationBps(sellRateAtoB, baselineAtoB) ?? 0
            };
          }
        }

        chainPairs[pairKey].push(bestProfit);
        chainPairDetails[point.timestamp][pairKey] = bestDetail;
      }
    }
  });

  // 找出利润最高的前 20 个链对
  const profitablePairs = Object.entries(chainPairs)
    .map(([pair, values]) => {
      const validValues = values.filter((v): v is number => v !== null);
      const avgProfit = validValues.length > 0
        ? validValues.reduce((sum, v) => sum + v, 0) / validValues.length
        : 0;
      return { pair, avgProfit };
    })
    .sort((a, b) => b.avgProfit - a.avgProfit)
    .slice(0, 20)
    .map(item => item.pair);

  const totalPairsCount = Object.keys(chainPairs).length;

  // 转换数据格式供 Recharts 使用，并过滤异常值
  const chartData = history.map(point => {
    const timestamp = new Date(point.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const dataPoint: any = {
      timestamp,
      _rawTimestamp: point.timestamp, // 保存原始时间戳用于查找详细信息
      _details: chainPairDetails[point.timestamp] || {} // 保存详细信息
    };
    // 只显示最有利可图的链对
    profitablePairs.forEach(pairKey => {
      const profit = chainPairDetails[point.timestamp]?.[pairKey]?.profit ?? null;
      if (profit === null) {
        dataPoint[pairKey] = null;
        return;
      }

      const filtered = filterOutliers(
        profit,
        chainPairs[pairKey],
        10
      );

      dataPoint[pairKey] = filtered !== null ? parseFloat(filtered.toFixed(2)) : null;
    });

    return dataPoint;
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        输入数量: {amount.toLocaleString()} - 跨链套利机会 (bps)
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        收益 (bps) = (链A {pair.tokenA}→{pair.tokenB} 汇率 × 链B {pair.tokenB}→{pair.tokenA} 汇率 - 1) × 10000（自动选择更优方向）
      </p>

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
            label={{ value: '套利收益 (bps)', angle: -90, position: 'insideLeft', style: { fontSize: '11px' } }}
          />
          <Tooltip content={(props) => {
            // 从当前数据点获取详细信息
            const detailsMap = props.payload?.[0]?.payload?._details || {};
            return <CustomTooltip {...props} detailsMap={detailsMap} />;
          }} />
          <Legend
            wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
            iconType="line"
          />

          {profitablePairs.map((pairKey, index) => (
            <Line
              key={pairKey}
              type="monotone"
              dataKey={pairKey}
              name={pairKey}
              stroke={CHAIN_PAIR_COLORS[index % CHAIN_PAIR_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 space-y-2">
        <p className="text-xs text-gray-600 text-center">
          显示平均收益最高的前 20 个链对（共 {totalPairsCount} 种可能组合） | 正值表示套利机会，负值表示亏损
          <br />
          已过滤超出中位数 ±10 bps 的异常值
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>套利说明：</strong>对于每个链对，系统会自动计算两个方向的跨链往返（{pair.tokenA}→{pair.tokenB}→{pair.tokenA} 和 {pair.tokenB}→{pair.tokenA}→{pair.tokenB}），
            并显示收益更高的那个方向。收益为正表示存在套利机会。
          </p>
        </div>
      </div>
    </div>
  );
}
