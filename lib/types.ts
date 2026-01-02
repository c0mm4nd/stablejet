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
  id: string; // e.g., "usdc_usdt", "usde_usdt", "usde_usdc"
  name: string; // e.g., "USDC/USDT", "USDe/USDT", "USDe/USDC"
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
}

export interface ChainSwapData {
  chain: string;
  chainKey: string;
  amount: number;
  pairId?: string; // Trading pair identifier
  dataSource?: 'kyberswap' | 'openocean' | 'binance' | 'mexc' | 'bybit'; // 数据来源
  usdcToUsdt: SwapResult;
  usdtToUsdc: SwapResult;
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
}

export interface OpenOceanQuoteResponse {
  code: number;
  data?: {
    inToken: {
      symbol: string;
      name: string;
      address: string;
      decimals: number;
    };
    outToken: {
      symbol: string;
      name: string;
      address: string;
      decimals: number;
    };
    inAmount: string;
    outAmount: string;
    estimatedGas: string;
    path?: any;
  };
  error?: string;
}
