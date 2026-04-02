import { NextResponse } from 'next/server';
import { requireAgentAuth } from '@/lib/agentAuth';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export async function GET(req) {
  const denied = requireAgentAuth(req);
  if (denied) return denied;

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  let query = supabase
    .from('digest_results')
    .select('*')
    .order('published_at', { ascending: false });

  if (q) {
    query = query.ilike('title', `%${q.replace(/%/g, '\\%')}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
