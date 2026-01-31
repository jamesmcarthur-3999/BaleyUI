/**
 * OpenAPI JSON Endpoint
 *
 * Serves the OpenAPI 3.0 specification for the BaleyUI REST API.
 * This spec can be used with Swagger UI, code generators, and API clients.
 */

import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/api/openapi';

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
