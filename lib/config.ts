import { ChainConfig, TradingPair } from "./types";


// Token decimals (用于 amountIn/amountOut 的换算)
export const TOKEN_DECIMALS_BY_SYMBOL: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  USDS: 18,
  USDe: 18,
  USDE: 18,
  USD1: 18,
  USDf: 18,
  USDF: 18,
  PYUSD: 6,
  BYUSD: 6,
  USDai: 18,
  AUSD: 6,
  USDat: 6,
  RLUSD: 18,
  GHO: 18,
  USDG: 6,
  USDtb: 18,
  USDTB: 18,
  sUSDe: 18,
  SUSDE: 18,
  sDAI: 18,
  SDAI: 18,
  sUSDS: 18,
  SUSDS: 18,
  USR: 18,
  WSTUSR: 18,
  ETH: 18,
  BTC: 8,
  WBTC: 8,
  stETH: 18,
  STETH: 18,
  wstETH: 18,
  WSTETH: 18,
  wbETH: 18,
  WBETH: 18,
  cbETH: 18,
  CBETH: 18,
  rETH: 18,
  RETH: 18,
  weETH: 18,
  WEETH: 18,
  rsETH: 18,
  RSETH: 18,
  ezETH: 18,
  EZETH: 18,
  osETH: 18,
  OSETH: 18,
  mETH: 18,
  METH: 18,
  cbBTC: 8,
  CBBTC: 8,
  LBTC: 8,
  uniBTC: 8,
  UNIBTC: 8,
  SolvBTC: 18,
  SOLVBTC: 18,
  tBTC: 18,
  TBTC: 18,
};

export function getTokenDecimals(tokenSymbol: string): number {
  return TOKEN_DECIMALS_BY_SYMBOL[tokenSymbol] ?? TOKEN_DECIMALS_BY_SYMBOL[tokenSymbol.toUpperCase()] ?? 6;
}

function isScientificNotation(value: string): boolean {
  return /e/i.test(value);
}

// 将金额转换为链上整数（按指定 decimals）
export function toWei(amount: number, decimals: number = 6): string {
  if (!Number.isFinite(amount)) return '0';

  const negative = amount < 0;
  const abs = Math.abs(amount);

  const raw = abs.toString();
  const normalized = isScientificNotation(raw) ? abs.toFixed(decimals) : raw;

  const [wholeRaw, fracRaw = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals);

  const combined = (whole + frac).replace(/^0+(?=\d)/, '') || '0';
  const asBigInt = BigInt(combined);
  return (negative ? '-' : '') + asBigInt.toString();
}

// 从链上整数转换为可显示的数值（按指定 decimals）
export function fromWei(amountWei: string, decimals: number = 6): number {
  if (!amountWei) return 0;

  const negative = amountWei.startsWith('-');
  const raw = negative ? amountWei.slice(1) : amountWei;
  if (!raw) return 0;

  let bi: bigint;
  try {
    bi = BigInt(raw);
  } catch {
    return 0;
  }

  const base = BigInt(10) ** BigInt(decimals);
  const whole = bi / base;
  const fraction = bi % base;
  const fracStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');

  const s = fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
  const n = parseFloat(s);
  return negative ? -n : n;
}
