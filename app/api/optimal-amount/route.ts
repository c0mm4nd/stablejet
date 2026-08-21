import { NextResponse } from 'next/server';
import { probeOptimalAmount, ProbeBusyError } from '@/lib/optimal-amount';
import { getConfig } from '@/lib/server-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pairId, sellChainKey, sellSource, buyChainKey, buySource, baseAmount } = body || {};

    if (
      typeof pairId !== 'string' ||
      typeof sellChainKey !== 'string' ||
      typeof sellSource !== 'string' ||
      typeof buyChainKey !== 'string' ||
      typeof buySource !== 'string' ||
      typeof baseAmount !== 'number' || !isFinite(baseAmount) || baseAmount <= 0
    ) {
      return NextResponse.json({ success: false, error: 'Invalid parameters' }, { status: 400 });
    }

    const config = getConfig();
    if (!config.pairs[pairId]) {
      return NextResponse.json({ success: false, error: 'Unknown pair' }, { status: 400 });
    }

    const result = await probeOptimalAmount({ pairId, sellChainKey, sellSource, buyChainKey, buySource, baseAmount });
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    if (error instanceof ProbeBusyError) {
      return NextResponse.json({ success: false, error: 'Another probe is in progress, please retry shortly' }, { status: 429 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
