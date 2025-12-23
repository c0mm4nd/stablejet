# 快速参考指南：多交易对功能

## 概览
StableJet 现在支持监控多种稳定币交易对，每个交易对的数据独立加载。

## 支持的交易对

| 交易对 ID | 显示名称 | Token A | Token B | 状态 |
|-----------|----------|---------|---------|------|
| usdc_usdt | USDC/USDT | USDC | USDT | ✅ 默认 |
| usde_usdt | USDe/USDT | USDe | USDT | ✅ 可用 |
| usde_usdc | USDe/USDC | USDe | USDC | ✅ 可用 |

## 代币地址

### USDC
- Ethereum: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- Arbitrum: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- Polygon: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`

### USDT
- Ethereum: `0xdac17f958d2ee523a2206206994597c13d831ec7`
- Arbitrum: `0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9`
- Polygon: `0xc2132d05d31c914a87c6611c10748aeb04b58e8f`

### USDe
- Ethereum: `0x4c9EDD5852cd905f086C759E8383e09bff1E68B3`
- Arbitrum: `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34`
- Berachain: `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34`

## API 使用

### 获取所有交易对的历史数据
```bash
curl http://localhost:3000/api/history?hours=24
```

### 获取特定交易对的数据
```bash
# USDC/USDT
curl http://localhost:3000/api/history?hours=24&pair=usdc_usdt

# USDe/USDT
curl http://localhost:3000/api/history?hours=24&pair=usde_usdt

# USDe/USDC
curl http://localhost:3000/api/history?hours=24&pair=usde_usdc
```

## 添加新交易对

### 步骤 1: 定义代币字段
编辑 `lib/types.ts`:
```typescript
export interface ChainConfig {
  name: string;
  usdc: string;
  usdt: string;
  usde?: string;
  dai?: string;  // 新代币
}
```

### 步骤 2: 配置代币地址
编辑 `lib/config.ts`:
```typescript
ethereum: {
  name: "Ethereum",
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  usde: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
  dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",  // 新代币地址
}
```

### 步骤 3: 定义交易对
编辑 `lib/config.ts` 中的 `TRADING_PAIRS`:
```typescript
export const TRADING_PAIRS: Record<string, TradingPair> = {
  // ... 现有交易对
  usdc_dai: {
    id: "usdc_dai",
    name: "USDC/DAI",
    tokenA: "USDC",
    tokenB: "DAI",
    getAddressA: (chain) => chain.usdc,
    getAddressB: (chain) => chain.dai,
  },
};
```

完成！新交易对会自动出现在选择器中。

## 数据库结构

### chain_data 表新增字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| pair_id | TEXT | 交易对标识符 |
| token_a_to_b_input | REAL | Token A → B 输入金额 |
| token_a_to_b_output | REAL | Token A → B 输出金额 |
| token_a_to_b_output_usd | REAL | Token A → B 输出美元价值 |
| token_a_to_b_error | TEXT | Token A → B 错误信息 |
| token_b_to_a_input | REAL | Token B → A 输入金额 |
| token_b_to_a_output | REAL | Token B → A 输出金额 |
| token_b_to_a_output_usd | REAL | Token B → A 输出美元价值 |
| token_b_to_a_error | TEXT | Token B → A 错误信息 |

## 组件使用

### TradingPairSelector
```typescript
import TradingPairSelector from '@/components/TradingPairSelector';

<TradingPairSelector 
  selectedPair={selectedPair} 
  onPairChange={handlePairChange}
/>
```

### SwapDataGrid with Pair
```typescript
import SwapDataGrid from '@/components/SwapDataGrid';

<SwapDataGrid pairId="usdc_usdt" />
```

## 配置上下文

### 使用 selectedPair
```typescript
import { useConfig } from '@/contexts/ConfigContext';

function MyComponent() {
  const { selectedPair, updateSelectedPair } = useConfig();
  
  return (
    <button onClick={() => updateSelectedPair('usde_usdt')}>
      Switch to USDe/USDT
    </button>
  );
}
```

## 常见问题

### Q: 如何知道当前选中的交易对？
A: 使用 `useConfig()` hook 获取 `selectedPair`。

### Q: 交易对数据存储在哪里？
A: 存储在浏览器的 localStorage，key 为 `stablejet_selected_pair`。

### Q: 如何清除交易对选择？
A: 调用 `resetToDefaults()` 或手动清除 localStorage。

### Q: 支持多少个交易对？
A: 理论上无限制，但建议保持在 5-10 个以保持良好的用户体验。

### Q: 旧数据会丢失吗？
A: 不会，所有 USDC/USDT 旧数据的 pair_id 会自动设为 'usdc_usdt'。

## 性能考虑

- ✅ 每个交易对独立加载，减少内存占用
- ✅ 使用索引优化数据库查询
- ✅ localStorage 持久化，减少重复请求
- ✅ 交易对切换时清空旧数据，防止内存泄漏

## 进一步阅读

- `MULTI_PAIR_IMPLEMENTATION.md` - 详细实施文档
- `IMPLEMENTATION_COMPLETED.md` - 完成总结
- `README.md` - 项目完整文档
