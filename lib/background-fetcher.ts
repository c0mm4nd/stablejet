import { getAllSwapData, getSwapDataForPair } from './kyberswap';
import { saveDataPoint } from './history';
import { getKyberSwapRateLimiterStatus } from './kyberswap';
import { getOpenOceanRateLimiterStatus } from './openocean';
import { getBinanceRateLimiterStatus } from './binance';
import { TRADING_PAIRS } from './config';

class BackgroundFetcher {
  private intervalId: NodeJS.Timeout | null = null;
  private fetchInterval: number = 10000; // 默认10秒
  private isFetching: boolean = false;
  private lastFetchTime: number = 0;

  start(intervalSeconds: number = 10) {
    if (this.intervalId) {
      console.log('Background fetcher is already running');
      return;
    }

    this.fetchInterval = intervalSeconds * 1000;
    console.log(`Starting background fetcher with interval: ${intervalSeconds}s`);

    // 立即执行一次
    this.fetchData();

    // 然后定期执行
    this.intervalId = setInterval(() => {
      this.fetchData();
    }, this.fetchInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Background fetcher stopped');
    }
  }

  updateInterval(intervalSeconds: number) {
    console.log(`Updating background fetcher interval to: ${intervalSeconds}s`);
    this.fetchInterval = intervalSeconds * 1000;

    // 重启定时器
    this.stop();
    this.start(intervalSeconds);
  }

  async fetchData() {
    // 防止重复请求
    if (this.isFetching) {
      console.log('[BackgroundFetcher] Already fetching data, skipping...');
      return;
    }

    // 防抖：如果距离上次请求不到1秒，跳过
    const now = Date.now();
    if (now - this.lastFetchTime < 1000) {
      console.log('[BackgroundFetcher] Fetched too recently, skipping...');
      return;
    }

    this.isFetching = true;
    this.lastFetchTime = now;

    try {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`[BackgroundFetcher] [${new Date().toISOString()}] Starting data fetch...`);
      console.log(`${'='.repeat(70)}`);
      
      // 获取所有交易对的数据
      const allPairs = Object.keys(TRADING_PAIRS);
      console.log(`[BackgroundFetcher] Fetching data for ${allPairs.length} trading pairs: ${allPairs.join(', ')}`);
      
      for (const pairId of allPairs) {
        try {
          console.log(`\n[BackgroundFetcher] === Fetching ${pairId} ===`);
          const data = await getSwapDataForPair(pairId);
          
          // 统计成功和失败
          let successCount = 0;
          let failureCount = 0;
          const dataSourceStats: Record<string, { success: number; failed: number }> = {};
          
          for (const item of data) {
            const source = item.dataSource || 'kyberswap';
            if (!dataSourceStats[source]) {
              dataSourceStats[source] = { success: 0, failed: 0 };
            }
            
            // 检查通用字段
            const hasTokenASuccess = item.tokenAToB?.output !== null && item.tokenAToB?.output && item.tokenAToB.output > 0;
            const hasTokenBSuccess = item.tokenBToA?.output !== null && item.tokenBToA?.output && item.tokenBToA.output > 0;
            
            if (hasTokenASuccess) {
              dataSourceStats[source].success++;
              successCount++;
            } else {
              dataSourceStats[source].failed++;
              failureCount++;
            }
            
            if (hasTokenBSuccess) {
              dataSourceStats[source].success++;
              successCount++;
            } else {
              dataSourceStats[source].failed++;
              failureCount++;
            }
          }
          
          // 保存数据到历史记录
          if (data.length > 0) {
            saveDataPoint(data, pairId);
            console.log(`[BackgroundFetcher] ✓ ${pairId}: Saved ${data.length} data points`);
          }
          
          // 打印统计信息
          console.log(`[BackgroundFetcher] ${pairId} Statistics:`);
          console.log(`  Total: ${successCount + failureCount} swap directions`);
          console.log(`  Success: ${successCount}`);
          console.log(`  Failed: ${failureCount}`);
          console.log(`  By source:`);
          for (const [source, stats] of Object.entries(dataSourceStats)) {
            console.log(`    - ${source}: ${stats.success} success, ${stats.failed} failed`);
          }
        } catch (error) {
          console.error(`[BackgroundFetcher] Error fetching ${pairId}:`, error);
        }
      }
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`[BackgroundFetcher] Data fetch completed for all pairs`);
      console.log(`${'='.repeat(70)}\n`);
      
      // 显示速率限制器状态
      console.log('\n[BackgroundFetcher] Rate limiters:');
      try {
        const kyberStatus = getKyberSwapRateLimiterStatus();
        console.log(`  KyberSwap: ${kyberStatus.current}/${kyberStatus.max} @ ${kyberStatus.rate}`);
      } catch (e) { /* ignore */ }
      
      try {
        const openoceanStatus = getOpenOceanRateLimiterStatus();
        console.log(`  OpenOcean: ${openoceanStatus.current}/${openoceanStatus.max} @ ${openoceanStatus.rate}`);
      } catch (e) { /* ignore */ }
      
      try {
        const binanceStatus = getBinanceRateLimiterStatus();
        console.log(`  Binance: ${binanceStatus.rate}`);
      } catch (e) { /* ignore */ }
      
    } catch (error) {
      console.error('\n[BackgroundFetcher] ✗ Error fetching data:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isFetching = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.intervalId !== null,
      isFetching: this.isFetching,
      intervalSeconds: this.fetchInterval / 1000,
      lastFetchTime: this.lastFetchTime ? new Date(this.lastFetchTime).toISOString() : null
    };
  }
}

// 单例模式
const backgroundFetcher = new BackgroundFetcher();

// 在开发环境中自动启动
if (process.env.NODE_ENV === 'development' && process.env.DISABLE_BACKGROUND_FETCHER !== '1') {
  backgroundFetcher.start(10);
}

export default backgroundFetcher;
