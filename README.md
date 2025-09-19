# StableJet

稳定币（USDC、USDT、USR、USDe等）之间套利的监控与自动化交易工具

## 功能介绍

后台：
- 实时监控多个交易所的稳定币订单簿报价与深度
  - 通过交易所websocket API获取实时数据
- 实时监控各个链上主流DEX上的稳定币交易对曲线（基于各个链的公共RPC节点）
  - 通过sqlite数据库缓存链上数据，减少RPC请求次数
- 自动计算不同资金量下的套利空间（考虑交易费、提币费、跨链成本，不考虑slippage）
- 支持增加新的稳定币、链、交易所与DEX
- 支持通过拖拽工作流自定义书写套利策略

前端：
- 界面展示实时数据与套利机会
  - 基于React与Ant Design实现
  - 支持自动发送套利机会通知（基于Chrome通知）

## 支持的交易所与DEX
- 交易所：Binance、ByBit、Bitget、MEXC
- DEX：Uniswap V2/V3/V4、Curve、Balancer、PancaeSwap、SushiSwap、Native等
- 链：Ethereum、Arbitrum、Optimism、Polygon、BSC、Avalanche等
- 稳定币：USDC、USDT（USD₮0、USD₮0.s）、USDe、USR、USD1等多链稳定币
- 跨链方案：
  - USDC：CCTP v2 fast, garden.finance，交易所存提
  - USDT: Stargate(LayerZero)、交易所存提
  - USR: Stargate(LayerZero)
  - USDe: Stargate(LayerZero)、交易所存提
  - USD1: Transporter(CCIP)、交易所存提
  - BOLD: Transporter(CCIP)

## 公共RPC节点
见 rpcs.json
