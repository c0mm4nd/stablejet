export interface ChainConfig {
  name: string;
  usdc: string;
  usdt: string;
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
  dataSource?: 'kyberswap' | 'openocean' | 'binance'; // 数据来源
  usdcToUsdt: SwapResult;
  usdtToUsdc: SwapResult;
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
