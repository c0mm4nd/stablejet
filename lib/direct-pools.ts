import axios from 'axios';
import { PoolConfig, QuoteResult } from './types';
import { warn } from './logger';

// 直连 DEX 池子报价：绕过聚合器，直接 eth_call 主力池，无配额限制
// 支持 univ3（QuoterV2）、curve（get_dy）、univ2（getReserves 恒定乘积）
// 多池时按 1/K..K/K 采样输出曲线，用边际收益贪心求最优拆单（AMM 输出凹函数 ⇒ 贪心即最优）

const RPC_FALLBACK: Record<string, string> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
  optimism: 'https://optimism-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  bnb_chain: 'https://bsc-rpc.publicnode.com',
  avalanche: 'https://avalanche-c-chain-rpc.publicnode.com',
  linea: 'https://linea-rpc.publicnode.com',
  scroll: 'https://scroll-rpc.publicnode.com',
  mantle: 'https://mantle-rpc.publicnode.com',
  sonic: 'https://sonic-rpc.publicnode.com',
  unichain: 'https://unichain-rpc.publicnode.com',
};

// Uniswap V3 QuoterV2（canonical 部署，多链同地址；base/bnb 用官方部署地址）
const UNIV3_QUOTER: Record<string, string> = {
  ethereum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  arbitrum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  optimism: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  polygon: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  base: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  bnb_chain: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
};

const SPLIT_STEPS = 8; // 拆单采样粒度

function pad32(hex: string): string {
  return hex.replace(/^0x/, '').padStart(64, '0');
}

function addr32(address: string): string {
  return pad32(address.toLowerCase());
}

function uint32(value: bigint | number): string {
  return pad32(BigInt(value).toString(16));
}

function word(result: string, index: number): bigint {
  return BigInt('0x' + result.slice(2 + index * 64, 2 + (index + 1) * 64));
}

// token 数量（人类可读）→ base units bigint（定点字符串避免浮点误差）
function toBaseUnits(amount: number, decimals: number): bigint {
  const fixed = amount.toFixed(Math.min(decimals, 18));
  const [int, frac = ''] = fixed.split('.');
  return BigInt(int + frac.padEnd(decimals, '0').slice(0, decimals));
}

interface RpcCall { to: string; data: string; }

// 一次 HTTP 批量 eth_call，按序返回（失败项为 null）
async function ethCallBatch(rpcUrl: string, calls: RpcCall[]): Promise<(string | null)[]> {
  if (calls.length === 0) return [];
  const payload = calls.map((c, i) => ({
    jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'],
  }));
  const res = await axios.post(rpcUrl, payload, { timeout: 15000 });
  const body = Array.isArray(res.data) ? res.data : [res.data];
  const byId = new Map<number, string | null>();
  for (const item of body) {
    const ok = !item.error && typeof item.result === 'string' && item.result.length >= 66;
    byId.set(item.id, ok ? item.result : null);
  }
  return calls.map((_, i) => byId.get(i) ?? null);
}

export function poolLabel(pool: PoolConfig): string {
  return pool.label || `${pool.dex}:${pool.address.slice(0, 8)}`;
}

interface PoolsQuoteParams {
  pools: PoolConfig[];
  chainKey: string;      // 基础链 key（不含 wrapper 后缀）
  rpcUrl?: string;
  tokenAAddress: string;
  tokenBAddress: string;
  tokenADecimals: number;
  tokenBDecimals: number;
  amount: number;        // 输入数量（tokenIn 的人类可读单位）
  direction: 'AtoB' | 'BtoA';
}

export interface PoolsQuoteResult {
  perPool: { pool: PoolConfig; result: QuoteResult }[];
  split: QuoteResult | null; // 多池最优拆单的合成报价（池数 >= 2 时）
}

export async function getPoolQuotes(params: PoolsQuoteParams): Promise<PoolsQuoteResult> {
  const { pools, chainKey, tokenAAddress, tokenBAddress, tokenADecimals, tokenBDecimals, amount, direction } = params;
  const failAll = (error: string): PoolsQuoteResult => ({
    perPool: pools.map(pool => ({ pool, result: { success: false, error } })),
    split: null,
  });

  const rpcUrl = params.rpcUrl || RPC_FALLBACK[chainKey];
  if (!rpcUrl) return failAll(`No RPC for chain ${chainKey}`);

  const [tokenIn, tokenOut, decimalsIn] = direction === 'AtoB'
    ? [tokenAAddress, tokenBAddress, tokenADecimals]
    : [tokenBAddress, tokenAAddress, tokenBDecimals];
  const amountIn = toBaseUnits(amount, decimalsIn);
  if (amountIn <= 0n) return failAll('Zero input');

  // 单池只询全额；多池按 1/K..K/K 采样输出曲线用于拆单
  const steps = pools.length >= 2 ? SPLIT_STEPS : 1;
  const stepAmounts: bigint[] = [];
  for (let i = 1; i <= steps; i++) stepAmounts.push((amountIn * BigInt(i)) / BigInt(steps));

  try {
    // 组装批量调用；univ2 只需 token0+getReserves，各档本地算
    const calls: RpcCall[] = [];
    // callIndex[poolIdx][stepIdx] -> calls 下标；univ2 用 reservesIndex
    const callIndex: number[][] = [];
    const univ2Index: { token0: number; reserves: number }[] = [];

    pools.forEach(pool => {
      if (pool.dex === 'univ2') {
        univ2Index.push({ token0: calls.length, reserves: calls.length + 1 });
        callIndex.push([]);
        calls.push({ to: pool.address, data: '0x0dfe1681' }); // token0()
        calls.push({ to: pool.address, data: '0x0902f1ac' }); // getReserves()
        return;
      }
      univ2Index.push({ token0: -1, reserves: -1 });
      const idxs: number[] = [];
      for (const stepIn of stepAmounts) {
        idxs.push(calls.length);
        if (pool.dex === 'univ3') {
          const quoter = UNIV3_QUOTER[chainKey];
          // quoteExactInputSingle((tokenIn,tokenOut,amountIn,fee,sqrtPriceLimitX96))
          calls.push({
            to: quoter || '0x0000000000000000000000000000000000000000',
            data: '0xc6a5026a' + addr32(tokenIn) + addr32(tokenOut) + uint32(stepIn) + uint32(pool.fee ?? 3000) + uint32(0),
          });
        } else { // curve
          const iA = pool.indexA ?? 0;
          const iB = pool.indexB ?? 1;
          const [i, j] = direction === 'AtoB' ? [iA, iB] : [iB, iA];
          calls.push({ to: pool.address, data: '0x5e0d443f' + uint32(i) + uint32(j) + uint32(stepIn) }); // get_dy(int128,int128,uint256)
        }
      }
      callIndex.push(idxs);
    });

    const results = await ethCallBatch(rpcUrl, calls);

    // curve 的 int128 签名失败时，用 uint256 签名（crypto 池）重试一轮
    const retryCalls: RpcCall[] = [];
    const retryMap: { poolIdx: number; stepIdx: number }[] = [];
    pools.forEach((pool, pi) => {
      if (pool.dex !== 'curve') return;
      callIndex[pi].forEach((ci, si) => {
        if (results[ci] === null) {
          const iA = pool.indexA ?? 0;
          const iB = pool.indexB ?? 1;
          const [i, j] = direction === 'AtoB' ? [iA, iB] : [iB, iA];
          retryMap.push({ poolIdx: pi, stepIdx: si });
          retryCalls.push({ to: pool.address, data: '0x556d6e9f' + uint32(i) + uint32(j) + uint32(stepAmounts[si]) });
        }
      });
    });
    if (retryCalls.length > 0) {
      const retried = await ethCallBatch(rpcUrl, retryCalls);
      retried.forEach((r, k) => {
        if (r !== null) results[callIndex[retryMap[k].poolIdx][retryMap[k].stepIdx]] = r;
      });
    }

    // 每个池的输出曲线 outputs[poolIdx][stepIdx]（含失败 null）
    const curves: (bigint | null)[][] = pools.map((pool, pi) => {
      if (pool.dex === 'univ2') {
        const t0 = results[univ2Index[pi].token0];
        const rs = results[univ2Index[pi].reserves];
        if (!t0 || !rs) return stepAmounts.map(() => null);
        const token0 = '0x' + t0.slice(-40);
        const r0 = word(rs, 0);
        const r1 = word(rs, 1);
        const inIsToken0 = token0.toLowerCase() === tokenIn.toLowerCase();
        const [rIn, rOut] = inIsToken0 ? [r0, r1] : [r1, r0];
        return stepAmounts.map(x => {
          const xFee = x * 997n;
          const out = (xFee * rOut) / (rIn * 1000n + xFee);
          return out > 0n ? out : null;
        });
      }
      return callIndex[pi].map(ci => {
        const r = results[ci];
        if (!r) return null;
        const out = word(r, 0);
        return out > 0n ? out : null;
      });
    });

    const perPool = pools.map((pool, pi) => {
      const full = curves[pi][steps - 1];
      const result: QuoteResult = full !== null
        ? {
          success: true,
          amountOut: full.toString(),
          route: { type: 'pool', note: poolLabel(pool), selectedTool: poolLabel(pool) },
        }
        : { success: false, error: 'Pool quote failed' };
      return { pool, result };
    });

    // 多池最优拆单：K 份输入按边际输出贪心分配（凹函数 ⇒ 全局最优）
    let split: QuoteResult | null = null;
    if (pools.length >= 2) {
      const usable = curves.map((c, pi) => ({ pi, curve: c })).filter(({ curve }) => curve.every(v => v !== null));
      if (usable.length >= 2) {
        const alloc = new Map<number, number>(); // poolIdx -> 已分配份数
        usable.forEach(({ pi }) => alloc.set(pi, 0));
        let totalOut = 0n;
        for (let unit = 0; unit < steps; unit++) {
          let bestPi = -1;
          let bestGain = -1n;
          for (const { pi, curve } of usable) {
            const k = alloc.get(pi)!;
            if (k >= steps) continue;
            const gain = (curve[k] as bigint) - (k > 0 ? (curve[k - 1] as bigint) : 0n);
            if (gain > bestGain) { bestGain = gain; bestPi = pi; }
          }
          if (bestPi < 0) break;
          alloc.set(bestPi, alloc.get(bestPi)! + 1);
        }
        const parts: string[] = [];
        for (const { pi, curve } of usable) {
          const k = alloc.get(pi)!;
          if (k > 0) {
            totalOut += curve[k - 1] as bigint;
            parts.push(`${Math.round((k / steps) * 100)}% ${poolLabel(pools[pi])}`);
          }
        }
        if (totalOut > 0n && parts.length >= 2) {
          split = {
            success: true,
            amountOut: totalOut.toString(),
            route: { type: 'pool', note: parts.join(' + '), selectedTool: 'Split' },
          };
        }
      }
    }

    return { perPool, split };
  } catch (err) {
    warn(`[DirectPool] batch quote failed on ${chainKey}: ${err instanceof Error ? err.message : 'unknown'}`);
    return failAll(err instanceof Error ? err.message : 'Pool quote error');
  }
}
