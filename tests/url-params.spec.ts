import { test, expect } from '@playwright/test';

test.describe('URL参数管理', () => {
  test('默认访问首页应该设置URL参数', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 等待页面加载完成
    await page.waitForSelector('main', { timeout: 10000 });

    // 检查URL是否包含默认参数
    const url = new URL(page.url());
    expect(url.searchParams.has('pair')).toBeTruthy();
    expect(url.searchParams.get('tab')).toBe('quotes');
    expect(url.searchParams.get('mode')).toBe('roundtrip');
  });

  test('直接访问带有URL参数的页面应该正确初始化状态', async ({ page }) => {
    // 使用正确的pair ID格式（下划线分隔）
    const testUrl = '/?pair=USDC_USDT&tab=arbitrage&mode=triangular';

    await page.goto(testUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 检查URL参数是否保持
    const url = new URL(page.url());
    expect(url.searchParams.get('pair')).toBe('USDC_USDT');
    expect(url.searchParams.get('tab')).toBe('arbitrage');
    expect(url.searchParams.get('mode')).toBe('triangular');

    // 检查UI状态是否匹配
    // 检查Arbitrage标签是否激活
    const arbitrageTab = page.locator('button:has-text("Arbitrage")');
    await expect(arbitrageTab).toHaveClass(/bg-blue-600/);

    // 检查Triangular子标签是否激活
    const triangularTab = page.getByRole('button', { name: /Triangular/ });
    await expect(triangularTab).toHaveClass(/text-blue-600/);
  });

  test('切换tab应该更新URL参数', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 默认应该在quotes标签
    let url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('quotes');

    // 点击Arbitrage标签
    const arbitrageTab = page.locator('button:has-text("Arbitrage")');
    await arbitrageTab.click();

    // 等待URL更新
    await page.waitForURL(/tab=arbitrage/);

    // 检查URL是否更新
    url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('arbitrage');

    // 点击回Quotes标签
    const quotesTab = page.locator('button:has-text("Quotes")');
    await quotesTab.click();

    // 等待URL更新
    await page.waitForURL(/tab=quotes/);

    // 检查URL是否更新
    url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('quotes');
  });

  test('在arbitrage标签中切换mode应该更新URL参数', async ({ page }) => {
    await page.goto('/?tab=arbitrage');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 默认应该在roundtrip模式
    let url = new URL(page.url());
    expect(url.searchParams.get('mode')).toBe('roundtrip');

    // 检查Round Trip标签是否激活
    const roundTripTab = page.getByRole('button', { name: /Round Trip/ });
    await expect(roundTripTab).toHaveClass(/text-blue-600/);

    // 点击Triangular标签
    const triangularTab = page.getByRole('button', { name: /Triangular/ });
    await triangularTab.click();

    // 等待URL更新
    await page.waitForURL(/mode=triangular/);

    // 检查URL是否更新
    url = new URL(page.url());
    expect(url.searchParams.get('mode')).toBe('triangular');

    // 点击回Round Trip标签
    const roundTripTabAgain = page.getByRole('button', { name: /Round Trip/ });
    await roundTripTabAgain.click();

    // 等待URL更新
    await page.waitForURL(/mode=roundtrip/);

    // 检查URL是否更新
    url = new URL(page.url());
    expect(url.searchParams.get('mode')).toBe('roundtrip');
  });

  test('浏览器前进后退按钮应该正确恢复状态', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 等待初始URL参数设置
    await page.waitForURL(/tab=quotes/);

    // 切换到arbitrage标签
    const arbitrageTab = page.locator('button:has-text("Arbitrage")');
    await arbitrageTab.click();
    await page.waitForURL(/tab=arbitrage/);

    // 检查URL已更新
    let url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('arbitrage');

    // 切换到triangular模式
    const triangularTab = page.getByRole('button', { name: /Triangular/ });
    await triangularTab.click();
    await page.waitForURL(/mode=triangular/);

    // 检查URL已更新
    url = new URL(page.url());
    expect(url.searchParams.get('mode')).toBe('triangular');

    // 点击浏览器后退按钮
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // 等待状态同步

    // 应该回到arbitrage标签，但mode是roundtrip
    url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('arbitrage');
    expect(url.searchParams.get('mode')).toBe('roundtrip');

    // 再次后退
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // 等待状态同步

    // 应该回到quotes标签
    url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('quotes');

    // 点击前进按钮
    await page.goForward();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // 等待状态同步

    // 应该回到arbitrage标签
    url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('arbitrage');
    expect(url.searchParams.get('mode')).toBe('roundtrip');
  });

  test('刷新页面应该保持URL参数状态', async ({ page }) => {
    const testUrl = '/?pair=USDC_USDT&tab=arbitrage&mode=triangular';

    await page.goto(testUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 记录URL
    const beforeReloadUrl = page.url();

    // 刷新页面
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 检查URL是否保持
    const afterReloadUrl = page.url();
    expect(afterReloadUrl).toBe(beforeReloadUrl);

    // 检查状态是否正确
    const url = new URL(page.url());
    expect(url.searchParams.get('pair')).toBe('USDC_USDT');
    expect(url.searchParams.get('tab')).toBe('arbitrage');
    expect(url.searchParams.get('mode')).toBe('triangular');

    // 检查UI状态
    const arbitrageTab = page.locator('button:has-text("Arbitrage")');
    await expect(arbitrageTab).toHaveClass(/bg-blue-600/);

    const triangularTab = page.getByRole('button', { name: /Triangular/ });
    await expect(triangularTab).toHaveClass(/text-blue-600/);
  });

  test('URL参数和localStorage应该同步', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 获取初始pair
    const url = new URL(page.url());
    const initialPair = url.searchParams.get('pair');

    // 检查localStorage中的pair
    const storedPair = await page.evaluate(() => {
      return localStorage.getItem('stablejet_selected_pair');
    });

    expect(storedPair).toBe(initialPair);
  });

  test('直接修改URL应该更新页面状态', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('main', { timeout: 10000 });

    // 获取当前URL
    const currentUrl = new URL(page.url());

    // 修改URL参数
    currentUrl.searchParams.set('tab', 'arbitrage');
    currentUrl.searchParams.set('mode', 'triangular');

    // 导航到新URL
    await page.goto(currentUrl.toString());
    await page.waitForLoadState('networkidle');

    // 检查UI状态是否更新
    const arbitrageTab = page.locator('button:has-text("Arbitrage")');
    await expect(arbitrageTab).toHaveClass(/bg-blue-600/);

    const triangularTab = page.getByRole('button', { name: /Triangular/ });
    await expect(triangularTab).toHaveClass(/text-blue-600/);
  });
});
