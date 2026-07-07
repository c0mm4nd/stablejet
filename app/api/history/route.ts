import { NextResponse } from 'next/server';
import { getHistoryInRange } from '@/lib/history';
import backgroundFetcher from '@/lib/background-fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const pairId = searchParams.get('pair') || undefined; // Optional pair filter

    if (pairId) {
      backgroundFetcher.setActivePair(pairId);
    }

    // 确保后台数据获取任务已启动（首次请求时自动拉起）
    const status = backgroundFetcher.getStatus();
    if (!status.isRunning) {
      backgroundFetcher.start();
    }

    const history = getHistoryInRange(hours, pairId);

    return NextResponse.json({
      success: true,
      data: history,
      pairId: pairId || 'all'
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
