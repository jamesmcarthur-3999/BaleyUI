/**
 * OpenAPI JSON Endpoint
 *
 * Serves the OpenAPI 3.0 specification for the BaleyUI REST API.
 * This spec can be used with Swagger UI, code generators, and API clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/api/openapi';

// Allowed origins for CORS - restrict to known consumers
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  // Check if origin is in allowed list
  if (ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  // Also allow same-origin requests (no origin header)
  return null;
}

export async function GET(request: NextRequest) {
  const allowedOrigin = getAllowedOrigin(request);

  const headers: Record<string, string> = {
    'Cache-Control': 'public, max-age=3600',
  };

  // Only add CORS header if origin is allowed
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  }

  return NextResponse.json(openApiSpec, { headers });
}
