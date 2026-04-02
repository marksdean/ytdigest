import { NextResponse } from 'next/server';

export function unauthorizedAgent() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * @returns {NextResponse|null} Response to return if auth failed, or null if OK.
 */
export function requireAgentAuth(req) {
  const secret = process.env.DIGEST_AGENT_SECRET;
  if (!secret || !String(secret).trim()) {
    return NextResponse.json(
      { error: 'DIGEST_AGENT_SECRET is not configured' },
      { status: 503 }
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return unauthorizedAgent();
  }
  return null;
}
