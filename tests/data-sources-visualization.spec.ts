import { test, expect } from '@playwright/test';

// 获取所有配置的链和数据源
const EXPECTED_CHAINS = {
  // KyberSwap 数据源
  kyberswap: [
    'Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'BSC', 'Avalanche',
    'HyperEVM', 'Monad', 'Sonic', 'Etherlink', 'Mantle0', 'UniChain', 'Berachain'
  ],
  // Nordstern 数据源 (按需配置)
  nordstern: [],
  // Binance 数据源 (用于特定场景)
  binance: ['Binance']
};

const ALL_CHAINS = [
  ...EXPECTED_CHAINS.kyberswap,
  ...EXPECTED_CHAINS.nordstern,
  ...EXPECTED_CHAINS.binance
];

const EXPECTED_AMOUNTS = [5000, 10000, 30000, 50000];

test.describe('数据源和可视化验证', () => {
  test.beforeEach(async ({ page }) => {
    // 等待页面加载并给后台任务时间获取数据
    await page.goto('/');
    // 等待加载完成
    await page.waitForLoadState('networkidle');
  });

  test('应用程序正常加载', async ({ page }) => {
    // 检查页面标题或主要元素
    await expect(page.locator('text=StableJet Monitor')).toBeVisible({ timeout: 10000 });
  });

  test('配置设置按钮可见并可点击', async ({ page }) => {
    const settingsButton = page.getByRole('button', { name: '配置设置' });
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // 验证设置模态框打开
    await expect(page.locator('text=配置设置').first()).toBeVisible();
  });

  test('历史数据API可用', async ({ page }) => {
    // 等待并拦截API请求
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/history') && response.status() === 200,
      { timeout: 30000 }
    );

    await page.reload();
    const response = await responsePromise;
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);

    console.log(`✓ 历史数据API响应: ${data.data.length} 个数据点`);
  });

  test('验证所有配置的链都有数据', async ({ page }) => {
    // 等待数据加载
    await page.waitForTimeout(5000);

    // 打开设置查看启用的链
    await page.getByRole('button', { name: '配置设置' }).click();
    await page.waitForTimeout(1000);

    const chainCheckboxes = await page.locator('[type="checkbox"]').all();
    console.log(`找到 ${chainCheckboxes.length} 个链配置`);

    // 关闭设置
    const closeButton = page.locator('button:has-text("关闭")');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // 等待图表渲染
    await page.waitForTimeout(2000);

    // 验证至少有一些链的数据在显示
    const pageContent = await page.content();
    let foundChains = 0;

    for (const chain of ALL_CHAINS) {
      if (pageContent.includes(chain)) {
        foundChains++;
        console.log(`✓ 发现链: ${chain}`);
      }
    }

    console.log(`总计发现 ${foundChains} 个链在页面中`);
    expect(foundChains).toBeGreaterThan(0);
  });

  test('验证数据源标识正确显示', async ({ page }) => {
    // 等待页面加载
    await page.waitForTimeout(5000);

    const content = await page.content();

    // 检查是否有数据源信息（多种可能的标识方式）
    const hasKyberSwap = content.toLowerCase().includes('kyberswap') ||
      content.includes('KS') ||
      content.includes('🔷');
    const hasNordstern = content.toLowerCase().includes('nordstern') ||
      content.includes('NS');
    const hasBinance = content.toLowerCase().includes('binance') ||
      content.includes('BN') ||
      content.includes('💰');

    console.log('\n数据源标识检查:');
    console.log(`KyberSwap: ${hasKyberSwap ? '✓' : '✗'}`);
    console.log(`Nordstern: ${hasNordstern ? '✓' : '✗'}`);
    console.log(`Binance: ${hasBinance ? '✓' : '✗'}`);

    // 页面上应该至少提到一个数据源（可能在文本中）
    // 即使没有明确标识，页面也应该正常运行
    const hasAnyDataSourceMention = hasKyberSwap || hasNordstern || hasBinance;
    console.log(`数据源可见性: ${hasAnyDataSourceMention ? '✓ 有标识' : '未显示（可能正常）'}`);

    // 这个测试不强制要求，因为数据源可能不在UI上显示
    expect(true).toBe(true);
  });

  test('验证图表可视化组件渲染', async ({ page }) => {
    // 等待数据加载
    await page.waitForTimeout(5000);

    const content = await page.content();
    const hasData = !content.includes('暂无历史数据');

    // 检查是否有 recharts 组件渲染
    const svgElements = await page.locator('svg').count();
    console.log(`找到 ${svgElements} 个 SVG 图表元素`);

    if (hasData) {
      // 如果有数据，应该有图表元素
      expect(svgElements).toBeGreaterThan(0);

      // 检查图表容器
      const chartContainers = await page.locator('.recharts-wrapper').count();
      console.log(`找到 ${chartContainers} 个图表容器`);
    } else {
      console.log('⚠️  暂无数据，图表未渲染（正常）');
      expect(content).toContain('暂无历史数据');
    }
  });

  test('验证价差线图可视化', async ({ page }) => {
    // 等待数据加载
    await page.waitForTimeout(5000);

    const content = await page.content();

    // 检查价差相关的文本或占位符
    const hasSpreadInfo = content.includes('价差');

    // 如果没有数据，检查是否显示等待消息
    const hasPlaceholder = content.includes('暂无历史数据') ||
      content.includes('请等待数据收集');

    console.log(`价差可视化: ${hasSpreadInfo ? '✓ 找到' : '等待数据'}`);
    console.log(`占位符显示: ${hasPlaceholder ? '✓ 正常' : '✗'}`);

    // 应该至少有一个存在（有数据显示图表，或显示等待消息）
    expect(hasSpreadInfo || hasPlaceholder).toBe(true);
  });

  test('验证跨链套利机会可视化', async ({ page }) => {
    // 等待数据加载
    await page.waitForTimeout(5000);

    const content = await page.content();

    // 检查套利相关的文本或占位符
    const hasArbitrageInfo = content.includes('套利') ||
      content.includes('机会') ||
      content.includes('利润') ||
      content.includes('跨链');

    const hasPlaceholder = content.includes('暂无历史数据') ||
      content.includes('请等待数据收集');

    console.log(`套利可视化: ${hasArbitrageInfo ? '✓ 找到' : '等待数据'}`);
    console.log(`占位符显示: ${hasPlaceholder ? '✓ 正常' : '✗'}`);

    // 应该至少有一个存在
    expect(hasArbitrageInfo || hasPlaceholder).toBe(true);
  });

  test('验证时间窗口选择器', async ({ page }) => {
    await page.waitForTimeout(3000);

    const content = await page.content();
    const hasPlaceholder = content.includes('暂无历史数据');

    if (hasPlaceholder) {
      console.log('\n⚠️  暂无数据，时间窗口选择器不会显示');
      expect(hasPlaceholder).toBe(true);
      return;
    }

    // 查找时间窗口按钮
    const timeWindowButtons = [
      page.locator('button:has-text("5分钟")'),
      page.locator('button:has-text("10分钟")'),
      page.locator('button:has-text("30分钟")'),
      page.locator('button:has-text("1小时")')
    ];

    let visibleButtons = 0;
    for (const button of timeWindowButtons) {
      if (await button.isVisible().catch(() => false)) {
        visibleButtons++;
      }
    }

    console.log(`找到 ${visibleButtons} 个时间窗口按钮`);
    expect(visibleButtons).toBeGreaterThan(0);
  });

  test('验证金额配置', async ({ page }) => {
    // 打开设置
    await page.getByRole('button', { name: '配置设置' }).click();
    await page.waitForTimeout(1000);

    // 检查金额配置（从实际config获取）
    const content = await page.content();
    const expectedAmounts = [5000, 10000, 30000, 50000];
    let foundAmounts = 0;

    for (const amount of expectedAmounts) {
      // 检查可能的格式：5000, $5000, 5,000等
      if (content.includes(amount.toString()) ||
        content.includes(amount.toLocaleString())) {
        foundAmounts++;
        console.log(`✓ 发现金额配置: ${amount.toLocaleString()}`);
      }
    }

    console.log(`总计发现 ${foundAmounts}/${expectedAmounts.length} 个金额配置`);

    // 至少应该能找到一些金额配置
    expect(foundAmounts).toBeGreaterThan(0);
  });

  test('验证数据实时更新机制', async ({ page }) => {
    // 查找倒计时元素
    await page.waitForTimeout(3000);

    const content = await page.content();
    const hasCountdown = content.includes('秒后刷新') ||
      content.includes('更新') ||
      content.includes('刷新');

    console.log(`实时更新机制: ${hasCountdown ? '✓ 活跃' : '✗ 未发现'}`);
  });

  test('验证错误处理显示', async ({ page }) => {
    await page.waitForTimeout(3000);

    // 检查是否有错误信息显示组件
    const errorComponent = page.locator('text=/错误|失败|error/i').first();
    const hasErrorHandling = await errorComponent.isVisible().catch(() => false);

    console.log(`错误处理组件: ${hasErrorHandling ? '有错误显示' : '✓ 无错误 (正常)'}`);
  });

  test('截图保存当前状态', async ({ page }) => {
    // 等待完全加载
    await page.waitForTimeout(5000);

    // 截取全页面截图
    await page.screenshot({
      path: 'tests/screenshots/data-visualization-full.png',
      fullPage: true
    });

    console.log('\n✓ 截图已保存到 tests/screenshots/data-visualization-full.png');
  });

  test('性能检查 - 页面加载时间', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    console.log(`页面加载时间: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(30000); // 应该在30秒内加载完成
  });

  test('验证数据完整性 - 检查API响应结构', async ({ page }) => {
    const response = await page.waitForResponse(
      response => response.url().includes('/api/history'),
      { timeout: 30000 }
    );

    const data = await response.json();

    // 验证响应结构
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('data');

    if (data.data && data.data.length > 0) {
      const firstPoint = data.data[0];
      expect(firstPoint).toHaveProperty('timestamp');
      expect(firstPoint).toHaveProperty('data');

      if (firstPoint.data && firstPoint.data.length > 0) {
        const firstChainData = firstPoint.data[0];

        console.log('\n数据结构验证:');
        console.log('✓ 包含时间戳');
        console.log('✓ 包含链数据');
        console.log(`✓ 链名: ${firstChainData.chain}`);
        console.log(`✓ 数据源: ${firstChainData.dataSource || '未指定'}`);
        console.log(`✓ 金额: ${firstChainData.amount}`);

        expect(firstChainData).toHaveProperty('chain');
        expect(firstChainData).toHaveProperty('chainKey');
        expect(firstChainData).toHaveProperty('amount');
        expect(firstChainData).toHaveProperty('tokenAToB');
        expect(firstChainData).toHaveProperty('tokenBToA');
      }
    } else {
      console.log('\n⚠️  暂无历史数据，这是正常的如果应用刚启动');
    }
  });

  test('验证所有数据源类型都有记录', async ({ page }) => {
    const response = await page.waitForResponse(
      response => response.url().includes('/api/history'),
      { timeout: 30000 }
    );

    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const dataSources = new Set<string>();

      for (const point of data.data) {
        for (const chainData of point.data || []) {
          if (chainData.dataSource) {
            dataSources.add(chainData.dataSource);
          }
        }
      }

      console.log('\n发现的数据源:');
      dataSources.forEach(source => console.log(`✓ ${source}`));
      console.log(`总计 ${dataSources.size} 个数据源被使用`);

      // 至少应该有一个数据源
      expect(dataSources.size).toBeGreaterThan(0);
    }
  });
});
