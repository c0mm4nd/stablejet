import SwapDataGrid from '@/components/SwapDataGrid';

export const metadata = {
  title: 'StableJet Monitor - USDC/USDT 跨链兑换监控',
  description: '使用 KyberSwap API 监控多链 USDC/USDT 兑换汇率',
};

export default function Home() {
  return <SwapDataGrid />;
}
