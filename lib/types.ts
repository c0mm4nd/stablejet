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
    };
  };
}

export interface QuoteResult {
  success: boolean;
  amountOut?: string;
  amountOutUsd?: string;
  error?: string;
}
