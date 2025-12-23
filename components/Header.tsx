'use client';

interface HeaderProps {
  countdown: number;
}

export default function Header({ countdown }: HeaderProps) {
  const totalChains = 15;
  const totalAmounts = 4;
  const totalCombinations = totalChains * totalAmounts * 2; // 双向兑换
  const totalArbitragePairs = totalChains * (totalChains - 1); // 跨链套利对数

  return (
    <header className="text-center text-white mb-10">
      <h1 className="text-4xl md:text-5xl font-bold mb-3">
        StableJet Monitor
      </h1>
      <p className="text-lg opacity-90 mb-2">
        实时追踪 USDC/USDT 跨链套利机会 | 每 10 秒自动更新
      </p>
      <p className="text-base opacity-80 mb-6">
        {countdown > 0 ? `下次更新: ${countdown}秒` : '正在更新...'}
      </p>

      {/* 统计信息卡片 */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="text-3xl font-bold">{totalChains}</div>
            <div className="text-sm opacity-80">区块链网络</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="text-3xl font-bold">{totalAmounts}</div>
            <div className="text-sm opacity-80">金额档位</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="text-3xl font-bold">{totalCombinations}</div>
            <div className="text-sm opacity-80">监控组合</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="text-3xl font-bold">{totalArbitragePairs}</div>
            <div className="text-sm opacity-80">套利路径</div>
          </div>
        </div>
      </div>

      {/* 详细信息 */}
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/5 backdrop-blur-sm rounded-lg p-5">
          <div className="grid md:grid-cols-2 gap-4 text-left text-sm">
            <div>
              <h3 className="font-semibold mb-2 text-blue-200">📊 支持网络</h3>
              <p className="opacity-80 leading-relaxed">
                Ethereum • Polygon • Arbitrum • Optimism • Base • BSC • Avalanche •
                HyperEVM • Monad • Sonic • Etherlink • Mantle (USDC/USDT + USDC/USDT0) • UniChain • Berachain
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-green-200">💰 金额档位</h3>
              <p className="opacity-80 leading-relaxed">
                $1,000 • $10,000 • $20,000 • $50,000
                <br />
                <span className="text-xs">双向兑换: USDC ⇄ USDT</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
