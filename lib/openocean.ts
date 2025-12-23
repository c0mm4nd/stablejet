import axios from 'axios';
import { QuoteResult, OpenOceanQuoteResponse } from './types';
import { OPENOCEAN_CHAIN_CODE_BY_CHAIN_KEY } from './config';

// OpenOcean API v4 基础 URL
const OPENOCEAN_API_BASE = 'https://open-api.openocean.finance/v4';

// axios 会自动使用环境变量中的代理：HTTP_PROXY, HTTPS_PROXY, NO_PROXY
const axiosInstance = axios.create({
  timeout: 15000, // 15秒超时
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'stablejet-monitor/1.0'
  }
});

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// OpenOcean 速率限制器 - 2 RPS (20 requests / 10 seconds)
class OpenOceanRateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequests = 20; // 10秒内最多20个请求
  private readonly windowMs = 10000; // 10秒窗口
  private readonly minInterval = 500; // 最小间隔500ms (2 RPS)

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // 清理超过时间窗口的请求记录
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    
    // 如果达到限制，等待直到有空位
    while (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // 额外100ms缓冲
      console.log(`[OpenOcean] Rate limit reached (${this.requestTimes.length}/${this.maxRequests}), waiting ${waitTime}ms...`);
      await delay(waitTime);
      
      // 重新清理
      const newNow = Date.now();
      this.requestTimes = this.requestTimes.filter(time => newNow - time < this.windowMs);
    }
    
    // 确保最小间隔
    if (this.requestTimes.length > 0) {
      const lastRequest = this.requestTimes[this.requestTimes.length - 1];
      const timeSinceLastRequest = now - lastRequest;
      if (timeSinceLastRequest < this.minInterval) {
        const waitTime = this.minInterval - timeSinceLastRequest;
        await delay(waitTime);
      }
    }
    
    // 记录这次请求
    this.requestTimes.push(Date.now());
  }
  
  getStatus(): { current: number; max: number; rate: string } {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    return {
      current: this.requestTimes.length,
      max: this.maxRequests,
      rate: '2 RPS (20 req/10s)'
    };
  }
}

const rateLimiter = new OpenOceanRateLimiter();

function resolveOpenOceanChainCode(chainKey: string): string | null {
  const cleanKey = chainKey.split('_')[0];
  return OPENOCEAN_CHAIN_CODE_BY_CHAIN_KEY[chainKey] || OPENOCEAN_CHAIN_CODE_BY_CHAIN_KEY[cleanKey] || null;
}

// 带重试的请求
async function requestWithRetry(url: string, maxRetries = 3): Promise<OpenOceanQuoteResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 等待速率限制器允许
      await rateLimiter.waitForSlot();
      
      const response = await axiosInstance.get<OpenOceanQuoteResponse>(url);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        // 如果遇到速率限制，使用指数退避
        const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        const status = rateLimiter.getStatus();
        console.warn(`[OpenOcean] Rate limit hit (429), attempt ${attempt + 1}/${maxRetries}, current: ${status.current}/${status.max}, waiting ${waitTime}ms...`);
        
        if (attempt < maxRetries - 1) {
          await delay(waitTime);
          continue;
        }
      }
      
      // 其他错误
      if (axios.isAxiosError(error)) {
        console.error(`[OpenOcean] Axios error on attempt ${attempt + 1}/${maxRetries}: ${error.code || 'UNKNOWN'}, status: ${error.response?.status || 'N/A'}`);
      } else {
        console.error(`[OpenOcean] Error on attempt ${attempt + 1}/${maxRetries}:`, error instanceof Error ? error.message : 'Unknown error');
      }
      
      if (attempt === maxRetries - 1) {
        throw error;
      }
      
      // 网络错误也使用退避
      await delay(1000 * (attempt + 1));
    }
  }
  
  throw new Error('Max retries reached');
}

// 调用 OpenOcean API 获取报价（amountDecimals 为带 token decimals 的整数）
export async function getOpenOceanQuoteByChainKey(
  chainKey: string,
  inTokenAddress: string,
  outTokenAddress: string,
  amountDecimals: string,
  gasPriceGwei?: string
): Promise<QuoteResult> {
  const chainCode = resolveOpenOceanChainCode(chainKey);
  if (!chainCode) {
    console.error(`[OpenOcean] Unsupported chainKey: ${chainKey}`);
    return { success: false, error: `OpenOcean unsupported chainKey: ${chainKey}` };
  }

  const url = `${OPENOCEAN_API_BASE}/${chainCode}/quote`;
  const params = new URLSearchParams({
    inTokenAddress,
    outTokenAddress,
    amountDecimals,
    gasPrice: gasPriceGwei || '3',
  });

  try {
    const status = rateLimiter.getStatus();
    console.log(`[OpenOcean] Requesting quote for ${chainCode} (rate: ${status.current}/${status.max} @ ${status.rate}): ${inTokenAddress.slice(0, 6)}...→${outTokenAddress.slice(0, 6)}...`);
    
    const data = await requestWithRetry(`${url}?${params}`);

    if (data.code === 200 && data.data) {
      console.log(`[OpenOcean] ✓ Success for ${chainCode}: ${data.data.outAmount} out`);
      return {
        success: true,
        amountOut: data.data.outAmount,
      };
    }

    console.error(`[OpenOcean] Quote failed for ${chainCode}: code=${data.code}, error=${data.error || 'Unknown'}`);
    return {
      success: false,
      error: data.error || `OpenOcean quote failed (code=${data.code})`
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusText = error.response?.statusText || '';
      const errorData = error.response?.data || '';
      const message = `${error.message} (status: ${error.response?.status || 'N/A'}${statusText ? ', ' + statusText : ''}${errorData ? ', ' + JSON.stringify(errorData).slice(0, 100) : ''})`;
      console.error(`[OpenOcean] Error for ${chainCode}:`, message);
      return {
        success: false,
        error: message
      };
    }
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[OpenOcean] Error for ${chainCode}:`, message);
    return {
      success: false,
      error: message
    };
  }
}

// 导出速率限制器状态（用于监控）
export function getOpenOceanRateLimiterStatus() {
  return rateLimiter.getStatus();
}
