'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HistoryDataPoint } from '@/lib/history';
import { calculateSpreadBps, filterOutliers } from '@/lib/utils';

interface SpreadLineChartProps {
  history: HistoryDataPoint[];
  amount: number;
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
  'binance': 'Binance',
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
};

// 自定义 Tooltip 组件
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  // 按方向分组
  const usdcToUsdt = payload.filter((p: any) => p.dataKey.includes('(U→T)'));
  const usdtToUsdc = payload.filter((p: any) => p.dataKey.includes('(T→U)'));

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[280px]">
      <p className="font-semibold text-gray-800 mb-3 text-sm border-b pb-2">{label}</p>

      {usdcToUsdt.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-blue-600 mb-1">USDC → USDT</p>
          <div className="space-y-1">
            {usdcToUsdt.map((entry: any) => (
              <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="font-medium text-gray-700 min-w-[70px]">
                  {entry.name}:
                </span>
                <span className={`font-bold ${entry.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {entry.value} bps
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {usdtToUsdc.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-orange-600 mb-1">USDT → USDC</p>
          <div className="space-y-1">
            {usdtToUsdc.map((entry: any) => (
              <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="font-medium text-gray-700 min-w-[70px]">
                  {entry.name}:
                </span>
                <span className={`font-bold ${entry.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {entry.value} bps
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function SpreadLineChart({ history, amount }: SpreadLineChartProps) {
  const seriesBases = Array.from(
    new Set(
      history
        .flatMap(point => point.data)
        .filter(item => item.amount === amount)
        .map(item => `${item.chainKey}@${item.dataSource || 'kyberswap'}`)
    )
  ).sort();

  const sourceSuffix = (source: string) => (source === 'openocean' ? 'OO' : 'KS');
  const splitBase = (base: string) => {
    const [chainKey, dataSource] = base.split('@');
    return { chainKey, dataSource: dataSource || 'kyberswap' };
  };

  // 首先收集所有价差值用于计算中位数
  const allSpreads: { [key: string]: (number | null)[] } = {};
  seriesBases.forEach(base => {
    allSpreads[`${base} (U→T)`] = [];
    allSpreads[`${base} (T→U)`] = [];
  });

  // 收集所有价差值
  history.forEach(point => {
    point.data
      .filter(item => item.amount === amount)
      .forEach(item => {
        const base = `${item.chainKey}@${item.dataSource || 'kyberswap'}`;
        const usdcToUsdtSpread = calculateSpreadBps(item.usdcToUsdt.input, item.usdcToUsdt.output);
        const usdtToUsdcSpread = calculateSpreadBps(item.usdtToUsdc.input, item.usdtToUsdc.output);

        // 确保数组已初始化（处理配置中有但颜色定义中没有的链）
        if (!allSpreads[`${base} (U→T)`]) {
          allSpreads[`${base} (U→T)`] = [];
        }
        if (!allSpreads[`${base} (T→U)`]) {
          allSpreads[`${base} (T→U)`] = [];
        }

        allSpreads[`${base} (U→T)`].push(usdcToUsdtSpread);
        allSpreads[`${base} (T→U)`].push(usdtToUsdcSpread);
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
        // USDC → USDT
        const usdcToUsdtSpread = calculateSpreadBps(item.usdcToUsdt.input, item.usdcToUsdt.output);
        const filteredUsdcToUsdt = filterOutliers(
          usdcToUsdtSpread !== null ? parseFloat(usdcToUsdtSpread.toFixed(2)) : null,
          allSpreads[`${base} (U→T)`],
          10
        );
        dataPoint[`${base} (U→T)`] = filteredUsdcToUsdt;

        // USDT → USDC
        const usdtToUsdcSpread = calculateSpreadBps(item.usdtToUsdc.input, item.usdtToUsdc.output);
        const filteredUsdtToUsdc = filterOutliers(
          usdtToUsdcSpread !== null ? parseFloat(usdtToUsdcSpread.toFixed(2)) : null,
          allSpreads[`${base} (T→U)`],
          10
        );
        dataPoint[`${base} (T→U)`] = filteredUsdtToUsdc;
      });

    return dataPoint;
  });


  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-primary mb-4 text-center">
        ${amount.toLocaleString()} - 双向价差对比
      </h2>

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
            label={{ value: '价差 (bps)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
            iconType="line"
          />

          {/* USDC → USDT 线条（蓝色系） */}
          {seriesBases.map(base => {
            const { chainKey, dataSource } = splitBase(base);
            const palette = Object.values(USDC_TO_USDT_COLORS);
            const stroke = USDC_TO_USDT_COLORS[chainKey] || palette[Math.abs(chainKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length];

            return (
              <Line
                key={`${base}-usdc-usdt`}
                type="monotone"
                dataKey={`${base} (U→T)`}
                name={`${CHAIN_DISPLAY_NAMES[chainKey] || chainKey} [${sourceSuffix(dataSource)}] (U→T)`}
                stroke={stroke}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
                connectNulls
              />
            );
          })}

          {/* USDT → USDC 线条（橙/红色系） */}
          {seriesBases.map(base => {
            const { chainKey, dataSource } = splitBase(base);
            const palette = Object.values(USDT_TO_USDC_COLORS);
            const stroke = USDT_TO_USDC_COLORS[chainKey] || palette[Math.abs(chainKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length];

            return (
              <Line
                key={`${base}-usdt-usdc`}
                type="monotone"
                dataKey={`${base} (T→U)`}
                name={`${CHAIN_DISPLAY_NAMES[chainKey] || chainKey} [${sourceSuffix(dataSource)}] (T→U)`}
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
            <span className="text-gray-700">USDC → USDT（蓝色系）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-orange-500 border-t-2 border-dashed border-orange-500"></div>
            <span className="text-gray-700">USDT → USDC（橙色系，虚线）</span>
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
