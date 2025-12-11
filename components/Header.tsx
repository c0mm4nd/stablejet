'use client';

interface HeaderProps {
  countdown: number;
}

export default function Header({ countdown }: HeaderProps) {
  return (
    <header className="text-center text-white mb-10">
      <h1 className="text-4xl md:text-5xl font-bold mb-3">
        StableJet Monitor
      </h1>
      <p className="text-lg opacity-90 mb-2">
        USDC/USDT 跨链兑换价差分析 | 每10秒自动更新
      </p>
      <p className="text-base opacity-80 mb-4">
        {countdown > 0 ? `下次更新: ${countdown}秒` : '正在更新...'}
      </p>
      <div className="max-w-2xl mx-auto">
        <p className="text-sm opacity-75 leading-relaxed">
          监控 7 条主流区块链（Ethereum、Polygon、Arbitrum、Optimism、Base、BSC、Avalanche）
          <br />
          分析 4 个金额档位（$1,000 / $10,000 / $20,000 / $50,000）的双向兑换价差
        </p>
      </div>
    </header>
  );
}
