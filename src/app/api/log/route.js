import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req) {
  try {
    const body = await req.json();
    const logPath = path.join(process.cwd(), 'browser_logs.txt');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${JSON.stringify(body)}\n`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
