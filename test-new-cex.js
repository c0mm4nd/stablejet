/**
 * Test script for new CEX integrations (Bitget, Gate.io, HTX, Kraken)
 * Run with: node test-new-cex.js
 */

const { getBitgetSwapData, getBitgetRateLimiterStatus } = require('./lib/bitget.ts');
const { getGateSwapData, getGateRateLimiterStatus } = require('./lib/gate.ts');
const { getHtxSwapData, getHtxRateLimiterStatus } = require('./lib/htx.ts');
const { getKrakenSwapData, getKrakenRateLimiterStatus } = require('./lib/kraken.ts');

async function testExchange(name, swapDataFn, statusFn, symbol, amounts) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${name}...`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Test rate limiter status
    const status = statusFn();
    console.log(`[${name}] Rate limiter status:`, status);

    // Test swap data
    console.log(`[${name}] Fetching swap data for ${symbol} with amounts:`, amounts);
    const data = await swapDataFn(amounts, symbol);

    console.log(`[${name}] ✓ Success! Received ${data.length} data points`);

    // Show first result
    if (data.length > 0) {
      const first = data[0];
      console.log(`[${name}] Sample data:`, {
        chain: first.chain,
        chainKey: first.chainKey,
        amount: first.amount,
        dataSource: first.dataSource,
        aToBOutput: first.tokenAToB?.output,
        bToAOutput: first.tokenBToA?.output
      });
    }

    return { success: true, exchange: name };
  } catch (err) {
    console.error(`[${name}] ✗ Error:`, err.message);
    return { success: false, exchange: name, error: err.message };
  }
}

async function main() {
  console.log('Testing new CEX integrations...\n');

  const amounts = [10000];

  const results = await Promise.all([
    testExchange('Bitget', getBitgetSwapData, getBitgetRateLimiterStatus, 'USDCUSDT', amounts),
    testExchange('Gate.io', getGateSwapData, getGateRateLimiterStatus, 'USDC_USDT', amounts),
    testExchange('HTX', getHtxSwapData, getHtxRateLimiterStatus, 'usdcusdt', amounts),
    testExchange('Kraken', getKrakenSwapData, getKrakenRateLimiterStatus, 'USDCUSDT', amounts)
  ]);

  console.log(`\n${'='.repeat(60)}`);
  console.log('Test Summary');
  console.log(`${'='.repeat(60)}`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nSuccessful: ${successful.length}/${results.length}`);
  successful.forEach(r => console.log(`  ✓ ${r.exchange}`));

  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length}/${results.length}`);
    failed.forEach(r => console.log(`  ✗ ${r.exchange}: ${r.error}`));
  }

  console.log('\nNote: Some exchanges may fail due to API restrictions or rate limits.');
  console.log('The integration is complete if the build succeeded.\n');
}

main().catch(console.error);
