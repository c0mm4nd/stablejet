import { NextResponse } from 'next/server';
import { getAllSwapData } from '@/lib/kyberswap';
import { saveDataPoint } from '@/lib/history';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getAllSwapData();

    // 保存到历史记录
    saveDataPoint(data);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data
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
