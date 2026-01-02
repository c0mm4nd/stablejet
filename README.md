# StableJet Monitor

使用 KyberSwap 的 API 监控所有支持的链上稳定币兑换金额（支持多种交易对：USDC/USDT、USDe/USDT、USDe/USDC），通过现代化的 Web 界面展示，每隔10秒自动更新一次数据。

## 功能

- 监控 7 条主流区块链：Ethereum、Polygon、Arbitrum、Optimism、Base、BSC、Avalanche
- **支持多种交易对**：
  - USDC/USDT（默认）
  - USDe/USDT
  - USDe/USDC
- **交易对分离加载**：不同交易对数据独立加载，避免单页面数据量过大导致崩溃
- 测试 4 个输入数量档位：5,000、10,000、30,000、50,000（按“输入 token”的数量单位）
- 双向兑换监控：TokenA → TokenB 和 TokenB → TokenA
- **实时折线图**：显示多链价差随时间变化的趋势
- **历史数据存储**：自动保存最近 100 个数据点（约 16 小时）
- **多链对比**：在同一图表中对比所有链的价差表现
- 每 10 秒自动刷新数据
- 美观的响应式 Web 界面
- 现代化的 UI/UX 设计
- **交易对选择器**：一键切换不同交易对

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Recharts
- **API**: KyberSwap Aggregator API (V1)
- **前端**: React 18
- **数据库**: SQLite (better-sqlite3)
- **数据更新**: 客户端定时轮询

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

```bash
npm run dev
```

### 3. 生产构建

```bash
npm run build
npm start
```

### 4. 访问应用

打开浏览器访问：http://localhost:3000

## API 端点

### GET /api/swap-data

获取所有链上的 USDC/USDT 兑换数据，并自动保存到历史记录

**响应格式**:
```json
{
  "success": true,
  "timestamp": "2025-12-10T19:36:31.747Z",
  "data": [
    {
      "chain": "Ethereum",
      "chainKey": "ethereum",
      "amount": 1000,
      "usdcToUsdt": {
        "input": 1000,
        "output": 1002.585976,
        "outputUsd": 995.3967238991494
      },
      "usdtToUsdc": {
        "input": 1000,
        "output": 1000.822304,
        "outputUsd": 995.5108374728454
      }
    }
  ]
}
```

### GET /api/history

获取历史数据用于图表展示

**查询参数**:
- `hours` (可选): 获取最近 N 小时的数据，默认 24 小时
- `pair` (可选): 过滤特定交易对，如 "usdc_usdt"、"usde_usdt"、"usde_usdc"

**响应格式**:
```json
{
  "success": true,
  "pairId": "usdc_usdt",
  "data": [
    {
      "timestamp": "2025-12-10T19:36:31.747Z",
      "data": [...]
    }
  ]
}
```

## 如何添加新的交易对

1. 在 `lib/types.ts` 的 `ChainConfig` 中添加新代币字段
2. 在 `lib/config.ts` 中为支持的链添加代币地址
3. 在 `lib/config.ts` 的 `TRADING_PAIRS` 中添加新交易对定义
4. 页面会自动显示新的交易对选项

详细说明请参考 `MULTI_PAIR_IMPLEMENTATION.md`

## 支持的区块链和代币地址

### USDC (原生)

| 链 | 合约地址 |
|---|---|
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Polygon | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Optimism | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| BSC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| Avalanche | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` |

### USDT (原生)

| 链 | 合约地址 |
|---|---|
| Ethereum | `0xdac17f958d2ee523a2206206994597c13d831ec7` |
| Polygon | `0xc2132d05d31c914a87c6611c10748aeb04b58e8f` |
| Arbitrum | `0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9` |
| Optimism | `0x94b008aa00579c1307b0ef2c499ad98a8ce58e58` |
| Base | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |
| BSC | `0x55d398326f99059ff775485246999027b3197955` |
| Avalanche | `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7` |

### USDe (Ethena)

| 链 | 合约地址 |
|---|---|
| Ethereum | `0x4c9EDD5852cd905f086C759E8383e09bff1E68B3` |
| Arbitrum | `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` |
| Berachain | `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` |

## 项目结构

```
stablejet/
├── app/
│   ├── api/
│   │   └── swap-data/
│   │       └── route.ts      # API 路由
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 主页面
│   └── globals.css           # 全局样式
├── components/
│   ├── CrossChainArbitrageChart.tsx # 跨链套利机会图表
│   ├── ErrorMessage.tsx         # 错误信息组件
│   ├── Header.tsx               # 头部组件
│   ├── HistoryChartsView.tsx    # 历史图表容器组件
│   ├── LoadingSpinner.tsx       # 加载动画组件
│   ├── SettingsModal.tsx        # 设置模态框组件
│   ├── SpreadLineChart.tsx      # 折线图组件
│   ├── SwapDataGrid.tsx         # 主数据网格组件
│   └── TradingPairSelector.tsx  # 交易对选择器组件
├── lib/
│   ├── config.ts                # 配置文件（链和代币地址）
│   ├── db.ts                    # SQLite 数据库连接和初始化
│   ├── history.ts               # 历史数据存储模块
│   ├── kyberswap.ts             # KyberSwap API 调用
│   ├── types.ts                 # TypeScript 类型定义
│   └── utils.ts                 # 工具函数（价差计算等）
├── data/
│   └── history.db               # SQLite 数据库文件（自动生成）
├── public/                   # 静态资源
├── next.config.js            # Next.js 配置
├── tailwind.config.ts        # Tailwind CSS 配置
├── tsconfig.json             # TypeScript 配置
├── package.json              # 项目依赖配置
└── README.md                 # 本文档
```

## 主要特性

### 1. 多交易对支持

应用现在支持监控多种稳定币交易对：
- **USDC/USDT**：最常见的稳定币交易对
- **USDe/USDT**：Ethena 的 USDe 与 USDT 的交易
- **USDe/USDC**：USDe 与 USDC 的交易

**优势**：
- 不同交易对数据分离加载，避免页面数据量过大
- 快速切换查看不同交易对的价差情况
- 持久化用户选择，页面刷新后保持

### 2. 实时多链价差监控

为每个输入数量档位（5,000、10,000、30,000、50,000）生成两个折线图：
- TokenA → TokenB 价差趋势（如 USDC → USDT）
- TokenB → TokenA 价差趋势（如 USDT → USDC）

每个图表同时显示 7 条链的数据，方便对比不同链的表现。

### 3. 历史数据追踪

- 使用 SQLite 数据库存储历史数据
- 自动保存每次查询的结果
- 最多保留最近 100 个数据点
- 支持自定义时间范围查询
- 使用事务确保数据一致性
- 支持多交易对数据隔离存储
- 使用 `pair_id` 字段区分不同交易对
- WAL 模式提升并发性能

### 4. 指标计算（bps）

为避免将任意 token 误当作 1 美元稳定币，本项目统一用“汇率/偏差”来展示：
- **价差 (bps)**：相对全体中位数“隐含汇率”的偏差
- **跨链套利空间 (bps)**：两条链上的往返汇率乘积相对 1 的偏离，即 $(rate_{A\to B} \cdot rate_{B\to A}-1)\times 10000$

### 5. 交易对管理

- **一键切换**：通过顶部选择器快速切换交易对
- **数据隔离**：每个交易对独立加载数据
- **持久化**：选择自动保存到浏览器本地存储
- **可扩展**：易于添加新的交易对

### 6. 技术改进

相比之前的版本：

1. **现代化框架**: 从 Express + 原生 HTML 迁移到 Next.js 14
2. **类型安全**: 使用 TypeScript 提供完整的类型检查
3. **组件化**: React 组件化开发，代码更易维护
4. **数据可视化**: 使用 Recharts 提供专业的图表展示
5. **数据库**: 使用 SQLite 存储历史数据，性能优异
6. **历史数据**: 支持历史数据存储和趋势分析
7. **更好的性能**: Next.js 的优化和缓存机制
8. **多交易对支持**: 灵活支持多种代币交易对
9. **数据分离加载**: 避免单页面数据量过大

## 数据库结构

### 表：history_points

存储历史数据点的时间戳

| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| timestamp | TEXT | ISO 格式时间戳 |
| created_at | INTEGER | Unix 时间戳 |

### 表：chain_data

存储每个数据点的链数据

| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| history_point_id | INTEGER | 外键，关联 history_points |
| chain | TEXT | 链名称 |
| chain_key | TEXT | 链标识符 |
| amount | INTEGER | 测试金额 |
| usdc_to_usdt_* | REAL/TEXT | USDC → USDT 数据 |
| usdt_to_usdc_* | REAL/TEXT | USDT → USDC 数据 |

## 参考资料

- [KyberSwap API 文档](https://docs.kyberswap.com/)
- [Circle USDC 合约地址](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Tether USDT 网络指南](https://tether.to/)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)

## License

MIT
