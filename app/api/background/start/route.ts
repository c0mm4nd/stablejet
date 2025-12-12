import { NextRequest, NextResponse } from 'next/server';
import backgroundFetcher from '@/lib/background-fetcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 启动或更新后台任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { intervalSeconds = 10 } = body;

    // 验证间隔时间
    if (intervalSeconds < 1 || intervalSeconds > 300) {
      return NextResponse.json(
        { success: false, error: 'Interval must be between 1 and 300 seconds' },
        { status: 400 }
      );
    }

    const status = backgroundFetcher.getStatus();

    if (status.isRunning) {
      // 如果已经在运行，更新间隔
      backgroundFetcher.updateInterval(intervalSeconds);
    } else {
      // 否则启动
      backgroundFetcher.start(intervalSeconds);
    }

    return NextResponse.json({
      success: true,
      status: backgroundFetcher.getStatus()
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
