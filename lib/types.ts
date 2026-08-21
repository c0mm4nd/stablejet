export interface ChainConfig {
  name: string;
  usdc: string;
  usdt: string;
  usde?: string; // USDe address for USDe pairs
  susde?: string; // sUSDe address for sUSDe pairs (Stargate)
  usr?: string; // Resolv USD (USR) address (Stargate)
  wstusr?: string; // Wrapped Staked USR address (Stargate)
}

export interface TradingPair {
  id: string; // e.g., "tokena_tokenb"
  name: string; // e.g., "TokenA/TokenB"
  tokenA: string; // token symbol: "USDC", "USDT", "USDe"
  tokenB: string;
  getAddressA: (chain: ChainConfig) => string | undefined;
  getAddressB: (chain: ChainConfig) => string | undefined;
}

export interface SwapResult {
  input: number;
  output: number | null;
  outputUsd: number | null;
  error?: string;
  route?: RouteInfo;
}

export interface RouteHop {
  pool?: string;
  tokenIn: string;
  tokenOut: string;
  swapAmount?: string;
  amountOut?: string;
  exchange?: string;
  poolType?: string;
}

export interface RouteAlternativeStep {
  type?: string;
  tool?: string;
  toolName?: string;
  fromChainId?: number;
  toChainId?: number;
  fromTokenSymbol?: string;
  fromTokenDecimals?: number;
  toTokenSymbol?: string;
  toTokenDecimals?: number;
  fromAmount?: string;
  toAmount?: string;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  executionDuration?: number;
  includedSteps?: RouteAlternativeStep[]; // sub-steps (pool-level routing within an aggregator)
}

export interface RouteAlternative {
  id?: string;
  fromAmount?: string;
  toAmount?: string;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  fromTokenSymbol?: string;
  fromTokenDecimals?: number;
  toTokenSymbol?: string;
  toTokenDecimals?: number;
  gasCostUSD?: string;
  toolNames?: string[];
  stepCount?: number;
  executionDuration?: number;
  steps?: RouteAlternativeStep[];
}

export type RouteType =
  | 'llamaswap'
  | 'lifi'
  | 'cetus'
  | 'jupiter'
  | 'panora'
  | 'aftermath'
  | 'cex'
  | 'pool'
  | 'unknown';

export type DataSource =
  | 'llamaswap'
  | 'lifi'
  | 'cetus'
  | 'jupiter'
  | 'panora'
  | 'aftermath'
  | 'binance'
  | 'mexc'
  | 'bybit'
  | 'bitget'
  | 'gate'
  | 'htx'
  | 'kraken'
  | 'okx';

export interface SourceConfig {
  llamaswap: boolean;
  lifi: boolean;
  cetus: boolean;
  jupiter: boolean;
  panora: boolean;
  aftermath: boolean;
  binance: boolean;
  bybit: boolean;
  mexc: boolean;
  bitget: boolean;
  gate: boolean;
  htx: boolean;
  kraken: boolean;
  okx: boolean;
}

export interface RouteInfo {
  type: RouteType;
  paths?: RouteHop[][];
  swaps?: any[];
  tx?: any;
  raw?: any;
  note?: string;
  selectedTool?: string;
  alternatives?: RouteAlternative[];
}

export interface ChainSwapData {
  chain: string;
  chainKey: string;
  amount: number;
  pairId?: string; // Trading pair identifier
  dataSource?: string; // DataSource or 'llamaswap/ToolName' / 'lifi/ToolName' for split aggregator results
  quoteTimestamp?: string; // ISO timestamp for this specific quote
  // Generic swap results for any pair
  tokenAToB?: SwapResult; // tokenA -> tokenB
  tokenBToA?: SwapResult; // tokenB -> tokenA
}

export interface SwapDataResponse {
  success: boolean;
  timestamp: string;
  data: ChainSwapData[];
  error?: string;
}

export interface QuoteResult {
  success: boolean;
  amountOut?: string;
  amountOutUsd?: string;
  error?: string;
  route?: RouteInfo;
}

// --- Config V2 Types ---

export interface ChainAppConfig {
  name: string;
  lifiChainId?: string;   // EVM numeric chain id, e.g. "1" (key name kept for saved-config compat)
  kyberCode?: string;     // KyberSwap chain slug, e.g. "ethereum"
  rpcUrl?: string;        // 直连池子询价用的 RPC（缺省用内置公共 RPC）
  disabled?: boolean;
}

// 直连 DEX 池子配置：绕过聚合器直接询价
export interface PoolConfig {
  dex: 'univ3' | 'univ2' | 'curve';
  address: string;
  label?: string;    // 展示名，如 "UniV3 0.01%"
  fee?: number;      // univ3 fee tier（100/500/3000/10000）
  quoter?: string;   // univ3 fork 的 QuoterV2 地址（覆盖链级默认）
  indexA?: number;   // curve: tokenA 的 coin index
  indexB?: number;   // curve: tokenB 的 coin index
  wrapper?: string;  // 挂到某个 wrapper（tokenA 为该 wrapper）而非主 tokenA
}

export interface WrapperConfig {
  oneWay?: 'AtoB' | 'BtoA'; // 单向报价限制
  symbol: string;   // e.g. "USDat"
  address: string;  // wrapper token address (replaces tokenA on this chain)
  decimals: number;
}

export interface ChainPairConfig {
  pools?: PoolConfig[]; // 直连池子（可与聚合器并存）
  oneWay?: 'AtoB' | 'BtoA'; // 单向报价（如 USDm 只能卖出不能买入）
  addressA?: string;
  addressB?: string;
  decimalsA?: number;
  decimalsB?: number;
  cexPairSymbol?: string; // e.g. "PAIRSYMBOL" for CEX
  disabled?: boolean;
  wrappers?: WrapperConfig[]; // same-chain wrappers of tokenA
}

export interface TradingPairConfig {
  id: string;          // e.g. "tokena_tokenb"
  name: string;        // e.g. "TokenA/TokenB"
  tokenA: string;      // Symbol A (e.g. "USDC")
  tokenB: string;      // Symbol B (e.g. "USDT")
  amounts: number[];   // e.g. [10000, 50000, 100000]
  disabled?: boolean;  // globally disable this pair
  chains: Record<string, ChainPairConfig>; // chainId -> { addressA, addressB }
}

export interface NotificationConfig {
  barkEndpoints: string[];  // e.g. ["https://api.day.app/yourkey"]
  minProfitBps: number;     // notify only when arb profit exceeds this
  cooldownMinutes: number;  // min minutes between notifications per pair
  priceChangeAlertBps: number; // notify when swap rate changes by more than this (0 = disabled)
}

export interface ConfigData {
  chains: Record<string, ChainAppConfig>; // chainId -> Config
  pairs: Record<string, TradingPairConfig>; // pairId -> Config
  sources: SourceConfig;
  clientRefreshInterval: number;
  notifications?: NotificationConfig;
}
