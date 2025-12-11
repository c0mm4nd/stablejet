import { NextResponse } from 'next/server';
import backgroundFetcher from '@/lib/background-fetcher';

export const dynamic = 'force-dynamic';

// 获取后台任务状态
export async function GET() {
  const status = backgroundFetcher.getStatus();
  return NextResponse.json({
    success: true,
    status
  });
}
