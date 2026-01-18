import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/server-config';
import { ConfigData } from '@/lib/types';

export const dynamic = 'force-dynamic'; // Ensure this endpoint is not cached

export async function GET() {
    try {
        const config = getConfig();
        return NextResponse.json(config);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const data = await request.json();

    // Basic validation (can be expanded)
    if (!data.chains || !data.pairs || !data.sources) {
      return NextResponse.json({ error: 'Invalid config structure' }, { status: 400 });
    }

        saveConfig(data as ConfigData);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}
