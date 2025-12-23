const { getBinanceSwapData } = require('./lib/binance.ts');

async function test() {
  console.log('Testing Binance data fetch...');
  const data = await getBinanceSwapData([5000, 10000, 30000, 50000]);
  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
