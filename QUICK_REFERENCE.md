# 快速参考指南：多交易对与多数据源

## 概览
StableJet 支持配置化交易对、代币地址与多数据源并行报价。

## 交易对
- 交易对列表来自配置文件或前端导入的 JSON
- 每个交易对包含：`id`、`name`、`tokenA`、`tokenB`

## API 使用

### 获取所有交易对的历史数据
```bash
curl http://localhost:3000/api/history?hours=24
```

### 获取特定交易对的数据
```bash
curl http://localhost:3000/api/history?hours=24&pair=example_pair
```

## 配置说明
- 代币地址需包含 `address` 与 `decimals`
- 同一链可配置多个交易对
- CEX 配置按交易对、按交易所单独填写

## 常见问题

### Q: 交易对数据存储在哪里？
A: 历史数据保存在本地 SQLite，按 `pair_id` 归档。

### Q: 支持多少个交易对？
A: 理论上无限制，但建议控制数量以保持良好体验。
