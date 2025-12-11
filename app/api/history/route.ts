import { NextResponse } from 'next/server';
import { getHistoryInRange } from '@/lib/history';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);

    const history = getHistoryInRange(hours);

    return NextResponse.json({
      success: true,
      data: history
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
