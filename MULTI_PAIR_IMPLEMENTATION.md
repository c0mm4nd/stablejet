# 多交易对支持实施总结

## 更新内容

### 1. 类型定义更新 (`lib/types.ts`)
- 在 `ChainConfig` 中添加了 `usde?` 字段，支持 USDe 代币地址
- 新增 `TradingPair` 接口，定义交易对结构
- 在 `ChainSwapData` 中添加了 `pairId`、`tokenAToB` 和 `tokenBToA` 字段，支持通用交易对

### 2. 配置更新 (`lib/config.ts`)
- 为主要链（Ethereum, Arbitrum, Berachain）添加了 USDe 代币地址
- 新增 `TRADING_PAIRS` 配置，支持三种交易对：
  - USDC/USDT
  - USDe/USDT
  - USDe/USDC
- 新增 `DEFAULT_TRADING_PAIR` 常量

### 3. 数据库架构更新 (`lib/db.ts`)
- 在 `chain_data` 表中添加了以下字段：
  - `pair_id`: 交易对标识符
  - `token_a_to_b_*`: tokenA -> tokenB 的交易数据
  - `token_b_to_a_*`: tokenB -> tokenA 的交易数据
- 新增索引 `idx_pair_chain_amount` 优化查询性能
- 实现了数据库迁移逻辑，自动添加新字段

### 4. 历史数据模块更新 (`lib/history.ts`)
- `saveDataPoint()` 函数新增 `pairId` 参数
- `getHistoryInRange()` 函数新增可选的 `pairId` 过滤参数
- 支持保存和查询特定交易对的历史数据

### 5. API 路由更新 (`app/api/history/route.ts`)
- 支持通过 `pair` 查询参数过滤特定交易对的数据
- 返回结果中包含 `pairId` 字段

### 6. 新增 UI 组件
#### `TradingPairSelector.tsx`
- 交易对选择器组件
- 显示所有可用的交易对
- 高亮显示当前选中的交易对
- 提供用户友好的选择界面

### 7. 主页面更新 (`app/page.tsx`)
- 集成交易对选择器
- 根据选中的交易对加载对应数据

### 8. 数据网格组件更新 (`components/SwapDataGrid.tsx`)
- 接受 `pairId` 属性
- 根据交易对动态加载数据
- 交易对切换时重置加载状态
- 显示无数据提示

### 9. 配置上下文更新 (`contexts/ConfigContext.tsx`)
- 新增 `selectedPair` 状态
- 新增 `updateSelectedPair()` 方法
- 支持从 localStorage 持久化交易对选择

## 功能特点

### 1. 分离加载
- 每个交易对的数据独立加载
- 避免单页面数据量过大导致崩溃
- 提升页面响应速度

### 2. 数据持久化
- 选中的交易对自动保存到 localStorage
- 页面刷新后保持用户选择

### 3. 向后兼容
- 数据库自动迁移，无需手动操作
- 现有 USDC/USDT 数据完全兼容
- 默认交易对为 USDC/USDT

### 4. 扩展性
- 易于添加新的交易对
- 只需在 `TRADING_PAIRS` 配置中添加新条目
- 在相应链的配置中添加代币地址

## 使用方法

### 添加新交易对

1. 在 `lib/config.ts` 的 `ChainConfig` 中添加新代币字段：
```typescript
export interface ChainConfig {
  name: string;
  usdc: string;
  usdt: string;
  usde?: string;
  newToken?: string; // 新代币
}
```

2. 为支持的链添加代币地址：
```typescript
ethereum: {
  name: "Ethereum",
  usdc: "0x...",
  usdt: "0x...",
  usde: "0x...",
  newToken: "0x...", // 新代币地址
}
```

3. 在 `TRADING_PAIRS` 中添加新交易对：
```typescript
export const TRADING_PAIRS: Record<string, TradingPair> = {
  // ... 现有交易对
  usdc_newtoken: {
    id: "usdc_newtoken",
    name: "USDC/NewToken",
    tokenA: "USDC",
    tokenB: "NewToken",
    getAddressA: (chain) => chain.usdc,
    getAddressB: (chain) => chain.newToken,
  },
};
```

## 测试建议

1. 测试交易对切换功能
2. 验证数据分离加载
3. 检查 localStorage 持久化
4. 测试数据库迁移
5. 验证无数据状态显示

## 未来改进方向

1. 后台任务支持多交易对数据收集
2. 图表组件适配通用交易对
3. 添加更多链的 USDe 支持
4. 实现交易对性能对比视图
