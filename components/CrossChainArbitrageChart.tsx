'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HistoryDataPoint } from '@/lib/history';
import { calculateSpreadBps, filterOutliers } from '@/lib/utils';

interface CrossChainArbitrageChartProps {
  history: HistoryDataPoint[];
  amount: number;
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
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  // 按收益排序
  const sortedPayload = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[300px] max-h-[400px] overflow-y-auto">
      <p className="font-semibold text-gray-800 mb-3 text-sm border-b pb-2">{label}</p>
      <div className="space-y-1">
        {sortedPayload.slice(0, 15).map((entry: any, index: number) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-medium text-gray-700 flex-1">
              {entry.dataKey}:
            </span>
            <span className={`font-bold ${entry.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {entry.value.toFixed(2)} bps
            </span>
          </div>
        ))}
        {sortedPayload.length > 15 && (
          <p className="text-xs text-gray-500 mt-2">... 还有 {sortedPayload.length - 15} 个链对</p>
        )}
      </div>
    </div>
  );
};

export default function CrossChainArbitrageChart({ history, amount }: CrossChainArbitrageChartProps) {
  // 首先收集所有链对的套利数据
  const chainPairs: { [key: string]: (number | null)[] } = {};

  // 收集所有套利值
  history.forEach(point => {
    const amountData = point.data.filter(item => item.amount === amount);

    // 计算所有可能的链对组合
    for (let i = 0; i < amountData.length; i++) {
      for (let j = 0; j < amountData.length; j++) {
        if (i === j) continue;

        const buyChain = amountData[i];
        const sellChain = amountData[j];
        const pairKey = `${buyChain.chain}→${sellChain.chain}`;

        if (!chainPairs[pairKey]) {
          chainPairs[pairKey] = [];
        }

        // 计算两个方向的套利，选择利润更高的
        // 方向1: 在 buyChain 用 USDC 买 USDT，在 sellChain 用 USDT 买 USDC
        const direction1_buySpread = calculateSpreadBps(buyChain.usdcToUsdt.input, buyChain.usdcToUsdt.output);
        const direction1_sellSpread = calculateSpreadBps(sellChain.usdtToUsdc.input, sellChain.usdtToUsdc.output);

        // 方向2: 在 buyChain 用 USDT 买 USDC，在 sellChain 用 USDC 买 USDT
        const direction2_buySpread = calculateSpreadBps(buyChain.usdtToUsdc.input, buyChain.usdtToUsdc.output);
        const direction2_sellSpread = calculateSpreadBps(sellChain.usdcToUsdt.input, sellChain.usdcToUsdt.output);

        let bestProfit = null;

        if (direction1_buySpread !== null && direction1_sellSpread !== null) {
          const direction1_profit = direction1_buySpread + direction1_sellSpread;
          bestProfit = direction1_profit;
        }

        if (direction2_buySpread !== null && direction2_sellSpread !== null) {
          const direction2_profit = direction2_buySpread + direction2_sellSpread;
          if (bestProfit === null || direction2_profit > bestProfit) {
            bestProfit = direction2_profit;
          }
        }

        chainPairs[pairKey].push(bestProfit);
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

  // 转换数据格式供 Recharts 使用，并过滤异常值
  const chartData = history.map(point => {
    const timestamp = new Date(point.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const dataPoint: any = { timestamp };
    const amountData = point.data.filter(item => item.amount === amount);

    // 只显示最有利可图的链对
    profitablePairs.forEach(pairKey => {
      const [buyChainName, sellChainName] = pairKey.split('→');
      const buyChain = amountData.find(item => item.chain === buyChainName);
      const sellChain = amountData.find(item => item.chain === sellChainName);

      if (buyChain && sellChain) {
        // 计算两个方向的套利，选择利润更高的
        // 方向1: 在 buyChain 用 USDC 买 USDT，在 sellChain 用 USDT 买 USDC
        const direction1_buySpread = calculateSpreadBps(buyChain.usdcToUsdt.input, buyChain.usdcToUsdt.output);
        const direction1_sellSpread = calculateSpreadBps(sellChain.usdtToUsdc.input, sellChain.usdtToUsdc.output);

        // 方向2: 在 buyChain 用 USDT 买 USDC，在 sellChain 用 USDC 买 USDT
        const direction2_buySpread = calculateSpreadBps(buyChain.usdtToUsdc.input, buyChain.usdtToUsdc.output);
        const direction2_sellSpread = calculateSpreadBps(sellChain.usdcToUsdt.input, sellChain.usdcToUsdt.output);

        let bestProfit = null;

        if (direction1_buySpread !== null && direction1_sellSpread !== null) {
          const direction1_profit = direction1_buySpread + direction1_sellSpread;
          bestProfit = direction1_profit;
        }

        if (direction2_buySpread !== null && direction2_sellSpread !== null) {
          const direction2_profit = direction2_buySpread + direction2_sellSpread;
          if (bestProfit === null || direction2_profit > bestProfit) {
            bestProfit = direction2_profit;
          }
        }

        if (bestProfit !== null) {
          // 过滤异常值
          const filtered = filterOutliers(
            bestProfit,
            chainPairs[pairKey],
            10
          );

          dataPoint[pairKey] = filtered !== null ? parseFloat(filtered.toFixed(2)) : null;
        } else {
          dataPoint[pairKey] = null;
        }
      }
    });

    return dataPoint;
  });

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-primary mb-2 text-center">
        ${amount.toLocaleString()} - 跨链套利机会
      </h2>
      <p className="text-sm text-gray-600 mb-4 text-center">
        收益 = 在链A买入USDT的价差 + 在链B卖出USDT的价差
      </p>

      <ResponsiveContainer width="100%" height={500}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="timestamp"
            stroke="#666"
            style={{ fontSize: '11px' }}
          />
          <YAxis
            stroke="#666"
            style={{ fontSize: '12px' }}
            label={{ value: '套利收益 (bps)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }}
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
          显示平均收益最高的前 20 个链对（共 42 种可能组合） | 正值表示套利机会，负值表示亏损
          <br />
          已过滤超出中位数 ±10 bps 的异常值
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>套利说明：</strong>对于每个链对，系统会自动计算两个方向的套利（USDC→USDT→USDC 和 USDT→USDC→USDT），
            并显示利润更高的那个方向。收益为正表示存在套利机会。
          </p>
        </div>
      </div>
    </div>
  );
}
