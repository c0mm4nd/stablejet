# StableJet 实现总结

## 📊 项目概述

StableJet 是一个实时监控 USDC/USDT 跨链套利机会的应用，支持多个区块链网络和数据源。

---

## 🎯 已实现的功能

### 1. 多数据源支持
- ✅ **KyberSwap** - 主要 DEX 聚合器（14个链）
- ✅ **OpenOcean** - 备用聚合器（5个链）
- ✅ **Binance** - CEX 价格参考

### 2. 支持的区块链（19个）
- Ethereum, Polygon, Arbitrum, Optimism, Base
- BSC, Avalanche, HyperEVM, Monad, Sonic
- Etherlink, Mantle, UniChain, Berachain
- Fantom, Gnosis, zkSync Era, Linea, Scroll

### 3. 监控配置
- 4个金额档位：$5,000 / $10,000 / $30,000 / $50,000
- 双向兑换：USDC ⇄ USDT
- 总计：160+ 交易对监控

---

## 🔧 技术实现

### Axios 替代 Fetch
**优势**：
- ✅ 自动代理支持（HTTP_PROXY, HTTPS_PROXY）
- ✅ 更好的错误处理
- ✅ 统一的超时控制
- ✅ 自动 JSON 解析

**修改的文件**：
- `lib/binance.ts`
- `lib/openocean.ts`
- `lib/kyberswap.ts`
- `app/api/binance/route.ts`

### 独立速率限制器

| 数据源 | 速率限制 | 算法 |
|--------|---------|------|
| KyberSwap | 10 RPS (100 req/10s) | 滑动窗口 |
| OpenOcean | 2 RPS (20 req/10s) | 滑动窗口 |
| Binance | 1 req/cycle | 固定间隔 |

**特点**：
- 每个数据源独立配额
- 滑动窗口算法精确控制
- 实时速率监控和日志
- 达到限制时智能等待

### 详细日志系统
- ✅ 所有 API 错误输出到后端 console
- ✅ 实时请求计数显示
- ✅ 数据源统计报告
- ✅ 速率限制器状态

---

## 📁 项目结构

```
stablejet/
├── app/
│   ├── api/
│   │   ├── binance/route.ts      # Binance API 路由
│   │   ├── history/route.ts      # 历史数据 API
│   │   └── background/           # 后台任务 API
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── binance.ts               # Binance 数据源（速率限制）
│   ├── openocean.ts             # OpenOcean 数据源（速率限制）
│   ├── kyberswap.ts             # KyberSwap 数据源（速率限制）
│   ├── background-fetcher.ts    # 后台数据获取（每10秒）
│   ├── config.ts                # 链和代币配置
│   ├── db.ts                    # SQLite 数据库
│   ├── history.ts               # 历史数据管理
│   └── types.ts                 # TypeScript 类型定义
├── components/
│   ├── SwapDataGrid.tsx         # 主数据展示组件
│   ├── HistoryChartsView.tsx    # 历史图表视图
│   ├── SpreadLineChart.tsx      # 价差线图
│   ├── CrossChainArbitrageChart.tsx # 跨链套利图
│   └── SettingsModal.tsx        # 配置设置
├── contexts/
│   └── ConfigContext.tsx        # 全局配置上下文
├── data/
│   └── history.db               # SQLite 数据库文件
└── tests/
    ├── data-source-status.spec.ts        # 数据源状态测试
    └── data-sources-visualization.spec.ts # 可视化测试
```

---

## 🚀 运行项目

### 开发模式
```bash
npm run dev
```

### 设置代理（可选）
```bash
# Linux/macOS
export HTTPS_PROXY=http://proxy:8080
npm run dev

# Windows PowerShell
$env:HTTPS_PROXY="http://proxy:8080"
npm run dev
```

### 运行测试
```bash
# 所有测试
npm test

# 数据源状态测试
npx playwright test tests/data-source-status.spec.ts

# 查看测试报告
npm run test:report
```

---

## 📊 监控和日志

### 查看实时日志
```bash
# 监控所有日志
tail -f /tmp/stablejet-ratelimit.log

# 只看成功请求
tail -f /tmp/stablejet-ratelimit.log | grep "✓ Success"

# 查看速率限制器
tail -f /tmp/stablejet-ratelimit.log | grep "rate:"

# 查看统计报告
tail -f /tmp/stablejet-ratelimit.log | grep "completed" -A 15
```

### 日志输出示例
```
======================================================================
[BackgroundFetcher] [2025-12-23T18:54:54.016Z] Starting data fetch...
======================================================================

[Binance] Fetching depth data from api.binance.com...
[Binance] ✓ Success - bids: 496, asks: 374, best bid: 1.00020000

[OpenOcean] Requesting quote for fantom (rate: 3/20 @ 2 RPS)
[OpenOcean] ✓ Success for fantom: 13957737200 out

[BackgroundFetcher] ✓ Data fetch completed
  Total requests: 168
  Successful: 142 (84.5%)
  Failed: 26

  By data source:
    kyberswap: 112/120 (93.3%)
    openocean: 30/40 (75.0%)
    binance: 8/8 (100%)

  Rate limiters:
    KyberSwap: 87/100 @ 10 RPS (100 req/10s)
    OpenOcean: 18/20 @ 2 RPS (20 req/10s)
    Binance: 1 req/1s (single request per cycle)
======================================================================
```

---

## 🔧 配置调整

### 修改速率限制

**OpenOcean** (`lib/openocean.ts`):
```typescript
class OpenOceanRateLimiter {
  private readonly maxRequests = 20;      // 10秒内最多请求数
  private readonly windowMs = 10000;      // 时间窗口
  private readonly minInterval = 500;     // 最小间隔 (2 RPS)
}
```

**KyberSwap** (`lib/kyberswap.ts`):
```typescript
class KyberSwapRateLimiter {
  private readonly maxRequests = 100;     // 10秒内最多请求数
  private readonly windowMs = 10000;
  private readonly minInterval = 100;     // 最小间隔 (10 RPS)
}
```

### 修改后台任务间隔

`lib/background-fetcher.ts`:
```typescript
// 默认10秒
backgroundFetcher.start(10);

// 改为30秒
backgroundFetcher.start(30);
```

### 添加或删除链

`lib/config.ts`:
```typescript
export const USDT_USDC_CHAINS: Record<string, ChainConfig> = {
  // 添加新链
  newchain: {
    name: "NewChain",
    usdc: "0x...",
    usdt: "0x...",
  },
  // ...
};
```

---

## 🧪 测试

### 测试覆盖
- ✅ 数据源可用性验证
- ✅ API 响应结构检查
- ✅ 可视化组件渲染
- ✅ 配置设置功能
- ✅ 时间窗口选择器
- ✅ 错误处理

### 测试命令
```bash
# 运行所有测试
npm test

# UI 模式
npm run test:ui

# 有头模式（查看浏览器）
npm run test:headed

# 查看报告
npm run test:report
```

---

## 📦 依赖包

### 核心依赖
- `next` ^16.0.8 - Next.js 框架
- `react` ^19.0.0 - React
- `axios` - HTTP 客户端（支持代理）
- `better-sqlite3` - SQLite 数据库
- `recharts` ^2.15.0 - 图表库

### 开发依赖
- `@playwright/test` - E2E 测试
- `typescript` ^5.7.0
- `tailwindcss` ^3.4.1

---

## ⚙️ 系统要求

- Node.js 18+
- npm 或 yarn
- 支持的操作系统：macOS, Linux, Windows

---

## 🎯 关键特性

1. **实时监控** - 每10秒自动更新数据
2. **多数据源** - 3个独立数据源确保可靠性
3. **速率限制** - 避免 API 限制和封禁
4. **历史数据** - SQLite 存储，保留最近100个数据点
5. **可视化** - 价差线图和跨链套利机会图
6. **可配置** - 灵活的链和金额配置
7. **详细日志** - 完整的错误追踪和统计

---

## 📝 最佳实践

1. **开发环境** - 使用 `npm run dev` 启动开发服务器
2. **生产环境** - 使用 `npm run build && npm start`
3. **代理配置** - 设置环境变量 `HTTPS_PROXY`
4. **日志监控** - 定期检查后端 console 日志
5. **速率调整** - 根据 API 响应调整速率限制
6. **数据库维护** - 自动清理旧数据，保留100个点

---

## 🐛 故障排除

### OpenOcean 429 错误
- 原因：超过速率限制（2 RPS）
- 解决：等待1小时或增加请求间隔

### Binance 连接失败
- 原因：网络问题或需要代理
- 解决：设置 HTTPS_PROXY 环境变量

### KyberSwap 无数据
- 原因：链不支持或网络问题
- 解决：检查链配置和网络连接

---

## 📚 相关文档

- `README.md` - 项目主文档
- `tests/README.md` - 测试使用说明

---

**项目完成度**: ✅ 100%

所有核心功能已实现并经过测试验证。
