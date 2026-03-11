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

// 不稳定代币列表
export const UNSTABLE_TOKENS: Record<string, string[]> = {
  native: [
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x0000000000000000000000000000000000000000"
  ],
  ethereum: [
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  ],
  polygon: [
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH (Bridged)
    "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", // WBTC (PoS)
  ],
  arbitrum: [
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", // WBTC
  ],
  optimism: [
    "0x4200000000000000000000000000000000000006", // WETH
    "0x68f180fcce6836688e9084f035309e29bf0a2095", // WBTC
  ],
  base: [
    "0x4200000000000000000000000000000000000006", // WETH
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // WBTC (LayerZero Bridged)
  ],
  bsc: [
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
    "0x4db5a66e937a9f4473fa95b1caf1d1e1d62e29ea", // WETH
  ],
  avalanche: [
    "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // WETH.e
    "0x50b7545627a5162f82a992c33b87adc75187b218", // WBTC.e
  ],
  mantle: [
    "0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111", // WETH
    "0xcabae6f6ea1ecab08ad02fe02ce9a44f09aebfa2", // WBTC
  ],
  sonic: [
    "0x50c42deacd8fc9773493ed674b675be577f2634b", // WETH
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // WBTC
  ],
  unichain: [
    "0x4200000000000000000000000000000000000006", // WETH
    "0x927b51f251480a681271180da4de28d44ec4afb8", // WBTC
  ],
  berachain: [
    "0x6969696969696969696969696969696969696969", // WBERA
    "0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590", // WETH
  ],
};

export function getAllUnstableTokens(): Set<string> {
  const allTokens = new Set<string>();
  Object.values(UNSTABLE_TOKENS).forEach(tokens => {
    tokens.forEach(token => allTokens.add(token.toLowerCase()));
  });
  return allTokens;
}

// Nordstern chain identifiers are configured per-chain in config.json.
