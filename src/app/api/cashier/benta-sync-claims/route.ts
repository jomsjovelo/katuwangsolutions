import { NextRequest, NextResponse } from 'next/server';
import { handleBentaSyncClaims } from '@/lib/server/benta-sync-claims-handler';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

  if (!idToken) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
  }

  const result = await handleBentaSyncClaims(idToken, body);
  return NextResponse.json(result.body, { status: result.status });
}
