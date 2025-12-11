import { ChainConfig } from "./types";

// 配置：支持的链和代币地址
export const USDT_USDC_CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  },
  polygon: {
    name: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
  },
  arbitrum: {
    name: "Arbitrum",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
  },
  optimism: {
    name: "Optimism",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    usdt: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
  },
  base: {
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdt: "0x102d758f688a4C1C5a80b116bD945d4455460282",
  },
  bsc: {
    name: "BSC",
    usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    usdt: "0x55d398326f99059ff775485246999027b3197955",
  },
  avalanche: {
    name: "Avalanche",
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    usdt: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
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
  },
  mantle: {
    name: "Mantle0",
    usdc: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    usdt: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
  },
  mantle_0: {
    name: "Mantle0",
    usdc: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    usdt: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
  },
  unichain: {
    name: "UniChain",
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    usdt: "0x9151434b16b9763660705744891fA906F660EcC5",
  },
  berachain: {
    name: "Berachain",
    usdc: "0x549943e04f40284185054145c6E4e9568C1D3241",
    usdt: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
  },
};

// 测试金额（以美元为单位）
export const AMOUNTS = [1000, 10000, 20000, 50000];

// 将美元金额转换为 wei（6位小数的稳定币）
export function toWei(amount: number): string {
  return (amount * 1e6).toString();
}

// 从 wei 转换回美元金额
export function fromWei(amountWei: string): number {
  return parseFloat(amountWei) / 1e6;
}
