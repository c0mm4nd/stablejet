# StableJet Monitor

多数据源、多链、可配置交易对的稳定币/资产兑换监控面板。支持 DEX 与 CEX 同时拉取报价、历史存储与多交易对切换。

## 功能

- 监控多链报价（按配置启用）
- **多交易对支持**：交易对与代币地址完全配置化
- **多数据源并行**：同链并行拉取 KyberSwap、Nordstern、Li.Fi（以及未来新增）
- 多档位输入金额测试
- 双向兑换监控：TokenA → TokenB 与 TokenB → TokenA
- 实时图表与历史记录
- 前端配置导入/导出（JSON）

## 技术栈

- **框架**: Next.js (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Recharts
- **数据库**: SQLite (better-sqlite3)

## 安装和运行

```bash
npm install
npm run dev
```

## API 端点

### GET /api/swap-data

获取所有已配置链与交易对的兑换数据，并保存到历史记录。

**响应格式**:
```json
{
  "success": true,
  "timestamp": "2026-01-17T12:00:00.000Z",
  "data": [
    {
      "chain": "Ethereum",
      "chainKey": "ethereum",
      "amount": 1000,
      "tokenAToB": {
        "input": 1000,
        "output": 999.12,
        "outputUsd": 999.12
      },
      "tokenBToA": {
        "input": 1000,
        "output": 1000.48,
        "outputUsd": 1000.48
      }
    }
  ]
}
```

### GET /api/history

获取历史数据用于图表展示。

**查询参数**:
- `hours` (可选): 获取最近 N 小时的数据，默认 24 小时
- `pair` (可选): 过滤特定交易对（以配置中的交易对 ID 为准）

**响应格式**:
```json
{
  "success": true,
  "pairId": "example_pair",
  "data": [
    {
      "timestamp": "2026-01-17T12:00:00.000Z",
      "data": []
    }
  ]
}
```

## 如何添加新的交易对

1. 在配置里新增交易对与代币地址（包含 decimals）
2. 通过前端配置导入或直接编辑 `lib/config.json`
3. 前端会自动显示新的交易对

## 项目结构

```
stablejet/
├── app/
├── components/
├── lib/
├── data/
├── public/
└── README.md
```
