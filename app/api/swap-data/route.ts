import { NextResponse } from 'next/server';
import backgroundFetcher from '@/lib/background-fetcher';

export const dynamic = 'force-dynamic';

// 手动触发一次数据获取（用于立即刷新）
export async function POST() {
  try {
    await backgroundFetcher.fetchData();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Data fetch triggered successfully'
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
