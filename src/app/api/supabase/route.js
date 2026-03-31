import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to your environment variables.');
  }
  return createClient(url, key);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource');

  let supabase;
  try {
    supabase = getClient();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  if (resource === 'channels') {
    const { data, error } = await supabase.from('channels').select('*').order('created_at');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ channels: data });
  }

  if (resource === 'results') {
    const { data, error } = await supabase
      .from('digest_results')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: data });
  }

  return NextResponse.json({ error: 'resource param required (channels or results)' }, { status: 400 });
}

export async function POST(req) {
  let supabase;
  try {
    supabase = getClient();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  const body = await req.json();
  const { resource, data } = body;

  if (resource === 'channels') {
    // Replace channel list
    await supabase.from('channels').delete().neq('id', '___placeholder___');
    const { error } = await supabase.from('channels').insert(data);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (resource === 'results') {
    // Append-only: upsert by video_id + channel to avoid duplicates
    const { error } = await supabase
      .from('digest_results')
      .upsert(data, { onConflict: 'video_id,channel' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'invalid resource' }, { status: 400 });
}
