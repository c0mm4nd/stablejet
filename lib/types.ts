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
}

export interface RouteInfo {
  type: 'kyberswap' | 'nordstern' | 'lifi' | 'cex' | 'unknown';
  paths?: RouteHop[][];
  swaps?: any[];
  tx?: any;
  raw?: any;
  note?: string;
}

export interface ChainSwapData {
  chain: string;
  chainKey: string;
  amount: number;
  pairId?: string; // Trading pair identifier
  dataSource?: 'kyberswap' | 'nordstern' | 'lifi' | 'binance' | 'mexc' | 'bybit'; // 数据来源
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
  disable?: boolean;
}

export interface ChainPairConfig {
  addressA?: string;
  addressB?: string;
  decimalsA?: number;
  decimalsB?: number;
  cexPairSymbol?: string; // e.g. "PAIRSYMBOL" for CEX
  disabled?: boolean;
}

export interface TradingPairConfig {
  id: string;          // e.g. "tokena_tokenb"
  name: string;        // e.g. "TokenA/TokenB"
  tokenA: string;      // Symbol A (e.g. "USDC")
  tokenB: string;      // Symbol B (e.g. "USDT")
  amounts: number[];   // e.g. [10000, 50000, 100000]
  chains: Record<string, ChainPairConfig>; // chainId -> { addressA, addressB }
}

export interface ConfigData {
  chains: Record<string, ChainAppConfig>; // chainId -> Config
  pairs: Record<string, TradingPairConfig>; // pairId -> Config
  clientRefreshInterval: number;
}
