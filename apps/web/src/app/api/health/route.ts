import { NextResponse } from 'next/server';
import { db, sql } from '@baleyui/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  const checks: Record<string, 'ok' | 'fail'> = {};

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
  }

  const allHealthy = Object.values(checks).every((v) => v === 'ok');

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp,
      checks,
      version: process.env.npm_package_version ?? 'unknown',
    },
    { status: allHealthy ? 200 : 503 }
  );
}
