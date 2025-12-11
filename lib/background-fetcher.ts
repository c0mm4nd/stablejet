import { getAllSwapData } from './kyberswap';
import { saveDataPoint } from './history';

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
      console.log('Already fetching data, skipping...');
      return;
    }

    // 防抖：如果距离上次请求不到1秒，跳过
    const now = Date.now();
    if (now - this.lastFetchTime < 1000) {
      console.log('Fetched too recently, skipping...');
      return;
    }

    this.isFetching = true;
    this.lastFetchTime = now;

    try {
      console.log(`[${new Date().toISOString()}] Fetching swap data...`);
      const data = await getAllSwapData();
      saveDataPoint(data);
      console.log(`[${new Date().toISOString()}] Data saved successfully`);
    } catch (error) {
      console.error('Error fetching data in background:', error);
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
