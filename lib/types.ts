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
  | 'kyberswap'
  | 'nordstern'
  | 'lifi'
  | 'zerox'
  | 'cetus'
  | 'jupiter'
  | 'panora'
  | 'aftermath'
  | 'cex'
  | 'unknown';

export type DataSource =
  | 'kyberswap'
  | 'nordstern'
  | 'lifi'
  | 'zerox'
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
  | 'kraken';

export interface SourceConfig {
  kyberswap: boolean;
  nordstern: boolean;
  lifi: boolean;
  zerox: boolean;
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
  dataSource?: string; // DataSource or 'lifi/ToolName' for split LiFi results
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

export interface KyberSwapQuoteResponse {
  code: number;
  message?: string;
  data?: {
    routeSummary?: {
      amountOut: string;
      amountOutUsd: string;
      tokenIn: string;
      tokenOut: string;
      route: Array<Array<{
        pool: string;
        tokenIn: string;
        tokenOut: string;
        swapAmount: string;
      }>>;
    };
  };
}

export interface QuoteResult {
  success: boolean;
  amountOut?: string;
  amountOutUsd?: string;
  error?: string;
  route?: RouteInfo;
}

export interface NordsternQuoteResponse {
  src: string;
  dst: string;
  fromAmount: string;
  toAmount: string;
  swaps?: any[];
  tx?: {
    data: string;
    from: string;
    to: string;
    value: string;
  };
}

// --- Config V2 Types ---

export interface ChainAppConfig {
  name: string;
  // API identifiers for aggregators
  kyberCode?: string;     // e.g. "ethereum"
  nordsternCode?: string; // e.g. "8118"
  lifiChainId?: string;   // e.g. "1"
  zeroXChainId?: string;  // e.g. "1" (EVM chain ID for 0x API)
  disabled?: boolean;
}

export interface WrapperConfig {
  symbol: string;   // e.g. "USDat"
  address: string;  // wrapper token address (replaces tokenA on this chain)
  decimals: number;
}

export interface ChainPairConfig {
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
