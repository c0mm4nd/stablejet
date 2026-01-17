import { test, expect } from '@playwright/test';

test.describe('数据源状态详细检查', () => {
  test('检查所有数据源的实际可用性', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 等待API响应
    const response = await page.waitForResponse(
      response => response.url().includes('/api/history'),
      { timeout: 30000 }
    );
    
    const data = await response.json();
    
    if (!data.success || !data.data || data.data.length === 0) {
      console.log('\n⚠️  暂无历史数据，需要等待后台任务收集数据');
      return;
    }
    
    // 获取最新的数据点
    const latestData = data.data[data.data.length - 1];
    
    // 统计各数据源的状态
    const dataSourceStats = {
      kyberswap: { total: 0, success: 0, failed: 0, errors: [] as string[] },
      nordstern: { total: 0, success: 0, failed: 0, errors: [] as string[] },
      binance: { total: 0, success: 0, failed: 0, errors: [] as string[] },
    };
    
    for (const chainData of latestData.data) {
      const source = chainData.dataSource || 'kyberswap';
      
      if (!dataSourceStats[source as keyof typeof dataSourceStats]) continue;
      
      const stats = dataSourceStats[source as keyof typeof dataSourceStats];
      stats.total += 2; // tokenA→tokenB + tokenB→tokenA
      
      // 检查 USDC→USDT
      if (chainData.tokenAToB?.output !== null && chainData.tokenAToB?.output > 0) {
        stats.success++;
      } else {
        stats.failed++;
        if (chainData.tokenAToB?.error) {
          stats.errors.push(`${chainData.chain} A→B: ${chainData.tokenAToB.error}`);
        }
      }
      
      // 检查 USDT→USDC
      if (chainData.tokenBToA?.output !== null && chainData.tokenBToA?.output > 0) {
        stats.success++;
      } else {
        stats.failed++;
        if (chainData.tokenBToA?.error) {
          stats.errors.push(`${chainData.chain} B→A: ${chainData.tokenBToA.error}`);
        }
      }
    }
    
    // 输出详细报告
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 数据源状态详细报告');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    for (const [source, stats] of Object.entries(dataSourceStats)) {
      if (stats.total === 0) continue;
      
      const successRate = ((stats.success / stats.total) * 100).toFixed(1);
      const icon = stats.failed === 0 ? '✅' : stats.success > 0 ? '⚠️' : '❌';
      
      console.log(`${icon} ${source.toUpperCase()}`);
      console.log(`   总请求: ${stats.total}`);
      console.log(`   成功: ${stats.success} (${successRate}%)`);
      console.log(`   失败: ${stats.failed}`);
      
      if (stats.errors.length > 0) {
        console.log(`   错误详情:`);
        // 只显示前5个错误，避免输出过长
        const displayErrors = stats.errors.slice(0, 5);
        for (const error of displayErrors) {
          console.log(`     - ${error}`);
        }
        if (stats.errors.length > 5) {
          console.log(`     ... 还有 ${stats.errors.length - 5} 个错误`);
        }
      }
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    
    // 生成统计摘要
    const totalSuccess = Object.values(dataSourceStats).reduce((sum, s) => sum + s.success, 0);
    const totalRequests = Object.values(dataSourceStats).reduce((sum, s) => sum + s.total, 0);
    const totalFailed = Object.values(dataSourceStats).reduce((sum, s) => sum + s.failed, 0);
    
    console.log('\n📈 总体统计:');
    console.log(`   总请求数: ${totalRequests}`);
    console.log(`   成功: ${totalSuccess} (${((totalSuccess / totalRequests) * 100).toFixed(1)}%)`);
    console.log(`   失败: ${totalFailed} (${((totalFailed / totalRequests) * 100).toFixed(1)}%)`);
    console.log('');
    
    // 检查 Nordstern 是否有 429 错误
    const has429Error = dataSourceStats.nordstern.errors.some(e => e.includes('429'));
    if (has429Error) {
      console.log('⚠️  Nordstern 遇到速率限制 (HTTP 429)');
      console.log('   建议: 增加请求间隔或使用 API key\n');
    }
    
    // 检查 Binance 是否有 fetch failed
    const hasFetchError = dataSourceStats.binance.errors.some(e => e.includes('fetch failed'));
    if (hasFetchError) {
      console.log('⚠️  Binance API 连接失败');
      console.log('   可能原因: 网络问题、CORS限制、或需要在服务端调用\n');
    }
    
    // 至少应该有一个数据源部分工作
    expect(totalSuccess).toBeGreaterThan(0);
  });
  
  test('按链统计数据源使用情况', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await page.waitForResponse(
      response => response.url().includes('/api/history'),
      { timeout: 30000 }
    );
    
    const data = await response.json();
    
    if (!data.success || !data.data || data.data.length === 0) {
      console.log('\n⚠️  暂无数据');
      return;
    }
    
    const latestData = data.data[data.data.length - 1];
    const chainStats: Record<string, { source: string; success: boolean }> = {};
    
    for (const chainData of latestData.data) {
      const hasSuccess = (chainData.tokenAToB?.output !== null && chainData.tokenAToB?.output > 0) ||
                        (chainData.tokenBToA?.output !== null && chainData.tokenBToA?.output > 0);
      
      chainStats[chainData.chain] = {
        source: chainData.dataSource || 'kyberswap',
        success: hasSuccess
      };
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('⛓️  各链数据源使用情况');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const groupedBySource: Record<string, string[]> = {
      kyberswap: [],
      nordstern: [],
      binance: []
    };
    
    for (const [chain, info] of Object.entries(chainStats)) {
      const status = info.success ? '✅' : '❌';
      const sourceKey = info.source.toLowerCase();
      groupedBySource[sourceKey]?.push(`${status} ${chain}`);
    }
    
    for (const [source, chains] of Object.entries(groupedBySource)) {
      if (chains.length === 0) continue;
      
      console.log(`📡 ${source.toUpperCase()} (${chains.length} 个链):`);
      for (const chain of chains) {
        console.log(`   ${chain}`);
      }
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');
  });
});
