import { log, error } from './logger';
import { getKyberSwapRateLimiterStatus } from './kyberswap';
import { getSwapDataForPair } from './swap-data';
import { saveDataPoint } from './history';
import { getNordsternRateLimiterStatus } from './nordstern';
import { getBinanceRateLimiterStatus } from './binance';
import { getBybitRateLimiterStatus } from './bybit';
import { getMexcRateLimiterStatus } from './mexc';
import { getBitgetRateLimiterStatus } from './bitget';
import { getGateRateLimiterStatus } from './gate';
import { getHtxRateLimiterStatus } from './htx';
import { getKrakenRateLimiterStatus } from './kraken';
import { getConfig } from './server-config';

type FetcherState = {
  intervalId: NodeJS.Timeout | null;
  fetchInterval: number;
  isFetching: boolean;
  lastFetchTime: number;
  fetchPromise: Promise<void> | null;
  startInProgress: boolean;
  activePairId: string | null;
};

class BackgroundFetcher {
  constructor(private state: FetcherState) {}

  start(intervalSeconds: number = 10) {
    if (this.state.intervalId || this.state.startInProgress) {
      log('Background fetcher is already running');
      return;
    }

    this.state.startInProgress = true;

    this.state.fetchInterval = intervalSeconds * 1000;
    log(`Starting background fetcher with interval: ${intervalSeconds}s`);

    // 立即执行一次
    this.fetchData();

    // 然后定期执行
    this.state.intervalId = setInterval(() => {
      this.fetchData();
    }, this.state.fetchInterval);

    this.state.startInProgress = false;
  }

  stop() {
    if (this.state.intervalId) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = null;
      log('Background fetcher stopped');
    }
  }

  updateInterval(intervalSeconds: number) {
    log(`Updating background fetcher interval to: ${intervalSeconds}s`);
    this.state.fetchInterval = intervalSeconds * 1000;

    // 重启定时器
    this.stop();
    this.start(intervalSeconds);
  }

  setActivePair(pairId: string | null) {
    if (pairId === this.state.activePairId) return;
    this.state.activePairId = pairId;
    log(`[BackgroundFetcher] Active pair set to: ${pairId || 'none'}`);
  }

  getActivePair() {
    return this.state.activePairId;
  }

  async fetchData() {
    if (this.state.fetchPromise) {
      return this.state.fetchPromise;
    }

    // 防抖：如果距离上次请求不到1秒，跳过
    const now = Date.now();
    if (now - this.state.lastFetchTime < 1000) {
      // log('[BackgroundFetcher] Fetched too recently, skipping...');
      return;
    }

    this.state.isFetching = true;
    this.state.lastFetchTime = now;

    const fetchPromise = (async () => {
      try {
        log(`${'='.repeat(70)}`);
        log(`[BackgroundFetcher] Starting data fetch...`);
        log(`${'='.repeat(70)}`);

        // 读取最新配置
        const config = getConfig();
        if (!config) {
          error('[BackgroundFetcher] Failed to load config');
          return;
        }

        const pairIds = Object.keys(config.pairs).filter(pairId => !config.pairs[pairId]?.disabled);

        log(`[BackgroundFetcher] Fetching data for ${pairIds.length} trading pairs: ${pairIds.join(', ')}`);

        for (const pairId of pairIds) {
          try {
            log(`[BackgroundFetcher] === Fetching ${pairId} ===`);
            const pairConfig = config.pairs[pairId];

            // Pass full config to usage logic, or pass relevant parts
            // getSwapDataForPair will now need to accept TradingPairConfig and the Global Chain Config map
            const data = await getSwapDataForPair(pairConfig, config.chains, config.sources);

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
              const hasTokenASuccess = item.tokenAToB?.output && item.tokenAToB.output > 0;
              const hasTokenBSuccess = item.tokenBToA?.output && item.tokenBToA.output > 0;

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
              log(`[BackgroundFetcher] ✓ ${pairId}: Saved ${data.length} data points`);
            }

            // 打印统计信息
            log(`[BackgroundFetcher] ${pairId} Statistics:`);
            log(`  Total: ${successCount + failureCount} swap directions`);
            log(`  Success: ${successCount}`);
            log(`  Failed: ${failureCount}`);
            log(`  By source:`);
            for (const [source, stats] of Object.entries(dataSourceStats)) {
              log(`    - ${source}: ${stats.success} success, ${stats.failed} failed`);
            }
          } catch (err) {
            error(`[BackgroundFetcher] Error fetching ${pairId}:`, err);
          }
        }

        log(`${'='.repeat(70)}`);
        log(`[BackgroundFetcher] Data fetch completed for all pairs`);
        log(`${'='.repeat(70)}\n`);

        // 显示速率限制器状态
        log('\n[BackgroundFetcher] Rate limiters:');
        try {
          const kyberStatus = getKyberSwapRateLimiterStatus();
          log(`  KyberSwap: ${kyberStatus.current}/${kyberStatus.max} @ ${kyberStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const nordsternStatus = getNordsternRateLimiterStatus();
          log(`  Nordstern: ${nordsternStatus.current}/${nordsternStatus.max} @ ${nordsternStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const binanceStatus = getBinanceRateLimiterStatus();
          log(`  Binance: ${binanceStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const bybitStatus = getBybitRateLimiterStatus();
          log(`  Bybit: ${bybitStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const mexcStatus = getMexcRateLimiterStatus();
          log(`  MEXC: ${mexcStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const bitgetStatus = getBitgetRateLimiterStatus();
          log(`  Bitget: ${bitgetStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const gateStatus = getGateRateLimiterStatus();
          log(`  Gate.io: ${gateStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const htxStatus = getHtxRateLimiterStatus();
          log(`  HTX: ${htxStatus.rate}`);
        } catch (e) { /* ignore */ }

        try {
          const krakenStatus = getKrakenRateLimiterStatus();
          log(`  Kraken: ${krakenStatus.rate}`);
        } catch (e) { /* ignore */ }

      } catch (err) {
        error('\n[BackgroundFetcher] ✗ Error fetching data:', err instanceof Error ? err.message : 'Unknown error');
      }
    })();

    this.state.fetchPromise = fetchPromise;

    try {
      await fetchPromise;
    } finally {
      this.state.fetchPromise = null;
      this.state.isFetching = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.state.intervalId !== null,
      isFetching: this.state.isFetching,
      intervalSeconds: this.state.fetchInterval / 1000,
      lastFetchTime: this.state.lastFetchTime ? new Date(this.state.lastFetchTime).toISOString() : null,
      activePairId: this.state.activePairId
    };
  }
}

// 单例模式
const GLOBAL_FETCHER_KEY = Symbol.for('stablejet.backgroundFetcher');
const GLOBAL_STATE_KEY = Symbol.for('stablejet.backgroundFetcher.state');

const globalState: FetcherState = (globalThis as any)[GLOBAL_STATE_KEY] || {
  intervalId: null,
  fetchInterval: 10000,
  isFetching: false,
  lastFetchTime: 0,
  fetchPromise: null,
  startInProgress: false,
  activePairId: null
};

const backgroundFetcher = (globalThis as any)[GLOBAL_FETCHER_KEY] || new BackgroundFetcher(globalState);

(globalThis as any)[GLOBAL_FETCHER_KEY] = backgroundFetcher;
(globalThis as any)[GLOBAL_STATE_KEY] = globalState;

// 在开发环境中自动启动
if (process.env.NODE_ENV === 'development' && process.env.DISABLE_BACKGROUND_FETCHER !== '1') {
  // Use a small delay to allow initial server startup (and prevent race conditions if hot reloading frequently)
  // or just start directly. The check inside start() prevents duplicates.
  backgroundFetcher.start(10);
}

export default backgroundFetcher;
