import { NextResponse } from 'next/server';
import { getNotifications } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const type = searchParams.get('type') || undefined;
    const pair_id = searchParams.get('pair_id') || undefined;

    const { rows, total } = getNotifications({ limit, offset, type, pair_id });
    return NextResponse.json({ success: true, data: rows, total, limit, offset });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
