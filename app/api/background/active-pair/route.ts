import { NextRequest, NextResponse } from 'next/server';
import backgroundFetcher from '@/lib/background-fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    success: true,
    activePairId: backgroundFetcher.getActivePair()
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pairId } = body || {};

    if (pairId !== null && typeof pairId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'pairId must be a string or null' },
        { status: 400 }
      );
    }

    const normalizedPairId = pairId === 'all' ? 'all' : (pairId || null);
    backgroundFetcher.setActivePair(normalizedPairId);

    return NextResponse.json({
      success: true,
      activePairId: backgroundFetcher.getActivePair()
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
