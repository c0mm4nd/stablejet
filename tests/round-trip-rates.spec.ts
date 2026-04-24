import { test, expect } from '@playwright/test';

const mockConfig = {
  chains: {
    chain_a: { name: 'Chain A' },
    chain_b: { name: 'Chain B' },
  },
  pairs: {
    USDC_USDT: {
      id: 'USDC_USDT',
      name: 'USDC/USDT',
      tokenA: 'USDC',
      tokenB: 'USDT',
      amounts: [10000],
      chains: {},
    },
  },
  sources: {
    lifi: true,
    cetus: true,
    jupiter: true,
    panora: true,
    aftermath: true,
    binance: true,
    bybit: true,
    mexc: true,
    bitget: true,
    gate: true,
    htx: true,
    kraken: true,
    okx: true,
  },
  clientRefreshInterval: 60,
};

const mockHistory = {
  success: true,
  pairId: 'USDC_USDT',
  data: [
    {
      timestamp: '2026-04-25T00:00:00.000Z',
      data: [
        {
          chain: 'Chain A',
          chainKey: 'chain_a',
          amount: 10000,
          pairId: 'USDC_USDT',
          dataSource: 'lifi',
          tokenAToB: { input: 10000, output: 10100, outputUsd: 10100 },
          tokenBToA: { input: 10000, output: 9900, outputUsd: 9900 },
        },
        {
          chain: 'Chain B',
          chainKey: 'chain_b',
          amount: 10000,
          pairId: 'USDC_USDT',
          dataSource: 'binance',
          tokenAToB: { input: 10000, output: 9900, outputUsd: 9900 },
          tokenBToA: { input: 10000, output: 10100, outputUsd: 10100 },
        },
      ],
    },
  ],
};

test.describe('round trip rate display', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.route('**/api/config', async (route) => {
      await route.fulfill({ json: mockConfig });
    });
    await page.route('**/api/history**', async (route) => {
      await route.fulfill({ json: mockHistory });
    });
    await page.route('**/api/background/active-pair', async (route) => {
      await route.fulfill({ json: { success: true } });
    });
  });

  test('shows quote quantities in buy and sell rate cells', async ({ page }) => {
    await page.goto('/?pair=USDC_USDT&tab=arbitrage&mode=roundtrip');

    await expect(page.getByRole('heading', { name: 'Round Trip Arbitrage' })).toBeVisible();
    const firstRow = page.locator('tbody tr').first();

    await expect(firstRow.locator('td').nth(3)).toContainText('1.010000');
    await expect(firstRow.locator('td').nth(3)).toContainText('10,000 USDT → 10,100 USDC');
    await expect(firstRow.locator('td').nth(4)).toContainText('1.010000');
    await expect(firstRow.locator('td').nth(4)).toContainText('10,000 USDC → 10,100 USDT');
  });
});
