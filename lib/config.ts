import { ChainConfig, TradingPair } from "./types";

// 配置：支持的链和代币地址 (KyberSwap)
export const USDT_USDC_CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    usde: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", // USDe on Ethereum
    susde: "0x9D39A5DE30e57443BfF2A837A4256c8797A3497", // sUSDe on Ethereum (Stargate token list)
    // Resolv (Stargate token list: https://stargate.finance/api/v1/tokens)
    usr: "0x66a1E37c9b0eAddca17d3662D6c05F4DECf3e110",
    wstusr: "0x1202F5C7b4B9E47a1A484E8B270be34dbbC75055",
  },
  polygon: {
    name: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Polygon
  },
  arbitrum: {
    name: "Arbitrum",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Arbitrum
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on Arbitrum (Stargate token list)
    // Resolv (Stargate)
    usr: "0x2492D0006411Af6C8bbb1c8afc1B0197350a79e9",
    wstusr: "0x66CFbD79257dC5217903A36293120282548E2254",
  },
  optimism: {
    name: "Optimism",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    usdt: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Optimism
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on Optimism (Stargate token list)
  },
  base: {
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdt: "0x102d758f688a4C1C5a80b116bD945d4455460282",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Base
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on Base (Stargate token list)
    // Resolv (Stargate)
    usr: "0x35E5dB674D8e93a03d814FA0ADa70731efe8a4b9",
    wstusr: "0xB67675158B412D53fe6B68946483ba920b135bA1",
  },
  bsc: {
    name: "BSC",
    usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    usdt: "0x55d398326f99059ff775485246999027b3197955",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on BSC
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on BSC (Stargate token list)
    // Resolv (Stargate)
    usr: "0x2492D0006411Af6C8bbb1c8afc1B0197350a79e9",
    wstusr: "0x4254813524695def4163A169e901f3d7a1a55429",
  },
  avalanche: {
    name: "Avalanche",
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    usdt: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Avalanche
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on Avalanche (Stargate token list)
  },
  hyperevm: {
    name: "HyperEVM",
    usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    usdt: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
  },
  monad: {
    name: "Monad",
    usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    usdt: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D",
  },
  sonic: {
    name: "Sonic",
    usdc: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
    usdt: "0x6047828dc181963ba44974801FF68e538dA5eaF9",
  },
  etherlink: {
    name: "Etherlink",
    usdc: "0x796Ea11Fa2dD751eD01b53C372fFDB4AAa8f00F9",
    usdt: "0x2C03058C8AFC06713be23e58D2febC8337dbfE6A",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Etherlink via Stargate
  },
  mantle: {
    name: "Mantle (USDC/USDT)",
    usdc: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    usdt: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Mantle via Stargate
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on Mantle (Stargate token list)
  },
  mantle_0: {
    name: "Mantle (USDC/USDT0)",
    usdc: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    usdt: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Mantle
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on Mantle (Stargate token list)
  },
  unichain: {
    name: "UniChain",
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    usdt: "0x9151434b16b9763660705744891fA906F660EcC5",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on UniChain via Stargate
  },
  berachain: {
    name: "Berachain",
    usdc: "0x549943e04f40284185054145c6E4e9568C1D3241",
    usdt: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Berachain (example)
    // Resolv (Stargate token list uses chainKey 'bera'; addresses should match on Berachain)
    usr: "0x2492D0006411Af6C8bbb1c8afc1B0197350a79e9",
    wstusr: "0xCC601605Dc5011616934B6FDAC8A14d51B791A94",
  },

  // CEX: Binance (使用订单簿计算，不需要链地址)
  binance: {
    name: "Binance (CEX)",
    usdc: "USDC", // 占位符，实际使用订单簿
    usdt: "USDT",
  },

  // CEX: MEXC
  mexc: {
    name: "MEXC (CEX)",
    usdc: "USDC",
    usdt: "USDT",
  },

  // CEX: Bybit
  bybit: {
    name: "Bybit (CEX)",
    usdc: "USDC",
    usdt: "USDT",
  },

  // 以下链：KyberSwap 往往不支持或不稳定，默认走 OpenOcean
  fantom: {
    name: "Fantom",
    usdc: "0x04068da6c83afcfa0e13ba15a6696662335d5b75",
    usdt: "0x049d68029688eabf473097a2fc38ef61633a3c7a",
  },
  gnosis: {
    name: "Gnosis",
    usdc: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83",
    usdt: "0x4ecaba5870353805a9f068101a40e0f32ed605c6",
  },
  zksync: {
    name: "zkSync Era",
    usdc: "0x3355df6d4c9c3035724fd0e3914de96a5a83aaf4",
    usdt: "0x493257fd37edb34451f62edf8d2a0c418852ba4c",
  },
  linea: {
    name: "Linea",
    usdc: "0x176211869ca2b568f2a7d4ee941e073a821ee1ff",
    usdt: "0xa219439258ca9da29e9cc4ce5596924745e12b93",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Linea via Stargate
  },
  scroll: {
    name: "Scroll",
    usdc: "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4",
    usdt: "0xf55bec9cafdbe8730f096aa55dad6d22d44099df",
    usde: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe on Scroll via Stargate
    susde: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe on Scroll (Stargate token list)
  },
};

// 测试金额（按“输入 token”的数量单位）
export const AMOUNTS = [30000, 50000];

// Token decimals (用于 amountIn/amountOut 的换算)
// 注意：USDe 为 18 decimals；USDC/USDT 一般为 6 decimals。
export const TOKEN_DECIMALS_BY_SYMBOL: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  USDe: 18,
  USDE: 18,
  sUSDe: 18,
  SUSDE: 18,
  USR: 18,
  WSTUSR: 18,
};

export function getTokenDecimals(tokenSymbol: string): number {
  return TOKEN_DECIMALS_BY_SYMBOL[tokenSymbol] ?? TOKEN_DECIMALS_BY_SYMBOL[tokenSymbol.toUpperCase()] ?? 6;
}

function isScientificNotation(value: string): boolean {
  return /e/i.test(value);
}

// 将金额转换为链上整数（按指定 decimals）
// amount 通常是以“币数量/美元数量”输入（稳定币近似 1:1）。
export function toWei(amount: number, decimals: number = 6): string {
  if (!Number.isFinite(amount)) return '0';

  const negative = amount < 0;
  const abs = Math.abs(amount);

  // 避免科学计数法导致的解析问题
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

// 不稳定代币列表（需要过滤的代币地址）
// 包括：原生代币、WETH、WBTC等可能导致价格失准的代币
// 数据来源：各链官方区块链浏览器（Etherscan, Polygonscan, Arbiscan等）
export const UNSTABLE_TOKENS: Record<string, string[]> = {
  // 原生代币地址（KyberSwap通常使用此地址表示原生代币）
  native: [
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x0000000000000000000000000000000000000000"
  ],
  // Ethereum
  ethereum: [
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  ],
  // Polygon
  polygon: [
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH (Bridged)
    "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", // WBTC (PoS)
  ],
  // Arbitrum
  arbitrum: [
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", // WBTC
  ],
  // Optimism
  optimism: [
    "0x4200000000000000000000000000000000000006", // WETH
    "0x68f180fcce6836688e9084f035309e29bf0a2095", // WBTC
  ],
  // Base
  base: [
    "0x4200000000000000000000000000000000000006", // WETH
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // WBTC (LayerZero Bridged)
  ],
  // BSC
  bsc: [
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB (Wrapped BNB)
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH (Binance-Peg Ethereum)
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB (Binance-Peg Bitcoin)
    "0x4db5a66e937a9f4473fa95b1caf1d1e1d62e29ea", // WETH (Wormhole)
  ],
  // Avalanche
  avalanche: [
    "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // WETH.e (Avalanche Bridge)
    "0x50b7545627a5162f82a992c33b87adc75187b218", // WBTC.e (Avalanche Bridge)
  ],
  // Mantle
  mantle: [
    "0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111", // WETH (Mantle Bridged)
    "0xcabae6f6ea1ecab08ad02fe02ce9a44f09aebfa2", // WBTC (Mantle Bridged)
  ],
  // Sonic
  sonic: [
    "0x50c42deacd8fc9773493ed674b675be577f2634b", // WETH (Sonic Labs)
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c", // WBTC
  ],
  // Unichain
  unichain: [
    "0x4200000000000000000000000000000000000006", // WETH
    "0x927b51f251480a681271180da4de28d44ec4afb8", // WBTC
  ],
  // Berachain
  berachain: [
    "0x6969696969696969696969696969696969696969", // WBERA (Wrapped Bera)
    "0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590", // WETH
  ],
};

// 获取所有不稳定代币地址（用于快速查找）
export function getAllUnstableTokens(): Set<string> {
  const allTokens = new Set<string>();
  Object.values(UNSTABLE_TOKENS).forEach(tokens => {
    tokens.forEach(token => allTokens.add(token.toLowerCase()));
  });
  return allTokens;
}

// OpenOcean API v4 的 chain path 参数（https://open-api.openocean.finance/v4/:chain/quote）
// 注意：这里是 OpenOcean 的“链代号”，不是 chainId。
export const OPENOCEAN_CHAIN_CODE_BY_CHAIN_KEY: Record<string, string> = {
  ethereum: 'eth',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  bsc: 'bsc',
  avalanche: 'avax',

  // OpenOcean 覆盖 KyberSwap 不支持/不稳定的链
  fantom: 'fantom',
  gnosis: 'gnosis',
  zksync: 'zksync',
  linea: 'linea',
  scroll: 'scroll',

  // 你现有配置里的一些新链（OpenOcean 文档里也有列出合约）
  sonic: 'sonic',
  hyperevm: 'hyperevm',
  monad: 'monad',
  unichain: 'unichain',
  berachain: 'berachain',
  mantle: 'mantle',
  mantle_0: 'mantle',
};

// 明确指定：这些链默认走 OpenOcean（避免先打 KyberSwap 再 404）
export const OPENOCEAN_ONLY_CHAINS = new Set<string>([
  'fantom',
  'gnosis',
  'zksync',
  'linea',
  'scroll',
]);

// Trading Pairs Configuration
export const TRADING_PAIRS: Record<string, TradingPair> = {
  usdc_usdt: {
    id: "usdc_usdt",
    name: "USDC/USDT",
    tokenA: "USDC",
    tokenB: "USDT",
    getAddressA: (chain) => chain.usdc,
    getAddressB: (chain) => chain.usdt,
  },
  usde_usdt: {
    id: "usde_usdt",
    name: "USDe/USDT",
    tokenA: "USDe",
    tokenB: "USDT",
    getAddressA: (chain) => chain.usde,
    getAddressB: (chain) => chain.usdt,
  },
  usde_usdc: {
    id: "usde_usdc",
    name: "USDe/USDC",
    tokenA: "USDe",
    tokenB: "USDC",
    getAddressA: (chain) => chain.usde,
    getAddressB: (chain) => chain.usdc,
  },

  susde_usdt: {
    id: "susde_usdt",
    name: "sUSDe/USDT",
    tokenA: "sUSDe",
    tokenB: "USDT",
    getAddressA: (chain) => chain.susde,
    getAddressB: (chain) => chain.usdt,
  },
  susde_usdc: {
    id: "susde_usdc",
    name: "sUSDe/USDC",
    tokenA: "sUSDe",
    tokenB: "USDC",
    getAddressA: (chain) => chain.susde,
    getAddressB: (chain) => chain.usdc,
  },

  // Resolv
  usr_usdc: {
    id: "usr_usdc",
    name: "USR/USDC",
    tokenA: "USR",
    tokenB: "USDC",
    getAddressA: (chain) => chain.usr,
    getAddressB: (chain) => chain.usdc,
  },
  usr_usdt: {
    id: "usr_usdt",
    name: "USR/USDT",
    tokenA: "USR",
    tokenB: "USDT",
    getAddressA: (chain) => chain.usr,
    getAddressB: (chain) => chain.usdt,
  },
  wstusr_usdc: {
    id: "wstusr_usdc",
    name: "wstUSR/USDC",
    tokenA: "wstUSR",
    tokenB: "USDC",
    getAddressA: (chain) => chain.wstusr,
    getAddressB: (chain) => chain.usdc,
  },
  wstusr_usdt: {
    id: "wstusr_usdt",
    name: "wstUSR/USDT",
    tokenA: "wstUSR",
    tokenB: "USDT",
    getAddressA: (chain) => chain.wstusr,
    getAddressB: (chain) => chain.usdt,
  },
};

// Default trading pair
export const DEFAULT_TRADING_PAIR = "usdc_usdt";
