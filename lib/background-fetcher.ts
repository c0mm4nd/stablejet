import { getAllSwapData } from './kyberswap';
import { saveDataPoint } from './history';
import { getKyberSwapRateLimiterStatus } from './kyberswap';
import { getOpenOceanRateLimiterStatus } from './openocean';
import { getBinanceRateLimiterStatus } from './binance';

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
      
      // getAllSwapData 会按链选择数据源（KyberSwap/OpenOcean/Binance）并返回统一结构
      const data = await getAllSwapData();
      
      // 统计成功和失败
      let successCount = 0;
      let failureCount = 0;
      const dataSourceStats: Record<string, { success: number; failed: number }> = {};
      
      for (const item of data) {
        const source = item.dataSource || 'kyberswap';
        if (!dataSourceStats[source]) {
          dataSourceStats[source] = { success: 0, failed: 0 };
        }
        
        const hasUsdcToUsdtSuccess = item.usdcToUsdt.output !== null && item.usdcToUsdt.output > 0;
        const hasUsdtToUsdcSuccess = item.usdtToUsdc.output !== null && item.usdtToUsdc.output > 0;
        
        if (hasUsdcToUsdtSuccess) {
          dataSourceStats[source].success++;
          successCount++;
        } else {
          dataSourceStats[source].failed++;
          failureCount++;
        }
        
        if (hasUsdtToUsdcSuccess) {
          dataSourceStats[source].success++;
          successCount++;
        } else {
          dataSourceStats[source].failed++;
          failureCount++;
        }
      }
      
      saveDataPoint(data);
      
      console.log(`\n[BackgroundFetcher] ✓ Data fetch completed`);
      console.log(`  Total requests: ${successCount + failureCount}`);
      console.log(`  Successful: ${successCount} (${((successCount / (successCount + failureCount)) * 100).toFixed(1)}%)`);
      console.log(`  Failed: ${failureCount}`);
      console.log('\n  By data source:');
      for (const [source, stats] of Object.entries(dataSourceStats)) {
        const total = stats.success + stats.failed;
        const rate = ((stats.success / total) * 100).toFixed(1);
        console.log(`    ${source}: ${stats.success}/${total} (${rate}%)`);
      }
      
      // 显示速率限制器状态
      console.log('\n  Rate limiters:');
      try {
        const kyberStatus = getKyberSwapRateLimiterStatus();
        console.log(`    KyberSwap: ${kyberStatus.current}/${kyberStatus.max} @ ${kyberStatus.rate}`);
      } catch (e) { /* ignore */ }
      
      try {
        const openoceanStatus = getOpenOceanRateLimiterStatus();
        console.log(`    OpenOcean: ${openoceanStatus.current}/${openoceanStatus.max} @ ${openoceanStatus.rate}`);
      } catch (e) { /* ignore */ }
      
      try {
        const binanceStatus = getBinanceRateLimiterStatus();
        console.log(`    Binance: ${binanceStatus.rate}`);
      } catch (e) { /* ignore */ }
      
      console.log(`${'='.repeat(70)}\n`);
    } catch (error) {
      console.error('\n[BackgroundFetcher] ✗ Error fetching data:', error instanceof Error ? error.message : 'Unknown error');
      console.error(`${'='.repeat(70)}\n`);
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
if (process.env.NODE_ENV === 'development') {
  backgroundFetcher.start(10);
}

export default backgroundFetcher;
