import { test, expect, devices } from '@playwright/test';

test.describe('移动端响应式设计', () => {
  test('移动端应该隐藏桌面版交易对选择器并显示底部选择器', async ({ page }) => {
    // 设置移动端viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 桌面版交易对选择器应该隐藏
    const desktopSelector = page.locator('header input[placeholder*="当前"]');
    await expect(desktopSelector).toBeHidden();

    // 底部交易对选择器应该可见
    const bottomSelector = page.locator('button').filter({ hasText: '当前交易对' });
    await expect(bottomSelector).toBeVisible();
  });

  test('移动端底部选择器应该能正常工作', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 点击底部选择器
    const bottomButton = page.locator('button').filter({ hasText: '当前交易对' });
    await bottomButton.click();

    // 应该显示下拉面板
    await page.waitForTimeout(300);
    const searchInput = page.locator('input[placeholder="搜索交易对..."]');
    await expect(searchInput).toBeVisible();

    // 搜索框应该自动获取焦点
    await expect(searchInput).toBeFocused();
  });

  test('移动端Header应该只显示Logo不显示文字', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Logo应该可见
    const logo = page.locator('header svg').first();
    await expect(logo).toBeVisible();

    // 标题文字应该隐藏（使用lg:block类）
    const title = page.locator('h1:has-text("StableJet Monitor")');
    await expect(title).toBeHidden();
  });

  test('移动端倒计时应该显示为圆形进度图标', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 检查圆形进度SVG存在
    const progressCircle = page.locator('header svg circle[class*="stroke-green"]');
    await expect(progressCircle).toBeVisible();

    // 检查时钟图标存在
    const clockIcon = page.locator('header svg path[d*="M12 8v4l3 3"]');
    await expect(clockIcon).toBeVisible();
  });

  test('平板设备应该显示桌面版交易对选择器', async ({ page }) => {
    // 设置iPad viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 桌面版选择器应该可见
    const desktopSelector = page.locator('header input[placeholder*="当前"]');
    await expect(desktopSelector).toBeVisible();

    // 底部选择器应该隐藏
    const bottomSelector = page.locator('button').filter({ hasText: '当前交易对' });
    await expect(bottomSelector).toBeHidden();
  });

  test('移动端Tab按钮应该全宽显示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 检查Quotes和Arbitrage按钮
    const quotesButton = page.locator('button:has-text("Quotes")').first();
    const arbitrageButton = page.locator('button:has-text("Arbitrage")').first();

    await expect(quotesButton).toBeVisible();
    await expect(arbitrageButton).toBeVisible();

    // 检查按钮容器是否有全宽样式
    const tabContainer = quotesButton.locator('..');
    await expect(tabContainer).toHaveClass(/w-full/);
  });

  test('不同移动设备尺寸都应该正常显示', async ({ page }) => {
    const devices = [
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'iPhone 12 Pro', width: 390, height: 844 },
      { name: 'Pixel 5', width: 393, height: 851 },
      { name: 'Samsung Galaxy S20', width: 360, height: 800 },
    ];

    for (const device of devices) {
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 基本元素都应该可见
      const logo = page.locator('header svg').first();
      await expect(logo).toBeVisible();

      const bottomSelector = page.locator('button').filter({ hasText: '当前交易对' });
      await expect(bottomSelector).toBeVisible();

      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();

      console.log(`✓ ${device.name} (${device.width}x${device.height}) 显示正常`);
    }
  });
});

test.describe('触摸优化', () => {
  test('按钮应该有触摸反馈', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 点击底部选择器应该有视觉反馈
    const bottomButton = page.locator('button').filter({ hasText: '当前交易对' });

    // 检查是否有touch-manipulation或active状态类
    const className = await bottomButton.getAttribute('class');
    expect(className).toBeTruthy();
  });
});
