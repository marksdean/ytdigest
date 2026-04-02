import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource');

  let supabase;
  try { supabase = getServiceSupabase(); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  if (resource === 'channels') {
    const { data, error } = await supabase.from('channels').select('*').order('created_at');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ channels: data ?? [] });
  }

  if (resource === 'results') {
    const { data, error } = await supabase
      .from('digest_results')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: data ?? [] });
  }

  return NextResponse.json({ error: 'resource param required' }, { status: 400 });
}

export async function POST(req) {
  let supabase;
  try { supabase = getServiceSupabase(); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  const body = await req.json();
  const { resource, data } = body;

  if (resource === 'channels') {
    // Replace entire channel list
    await supabase.from('channels').delete().neq('id', '___placeholder___');
    const { error } = await supabase.from('channels').insert(data);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (resource === 'results') {
    // Append-only upsert, keyed on (video_id, channel)
    const { error } = await supabase
      .from('digest_results')
      .upsert(data, { onConflict: 'video_id,channel' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (resource === 'result_meta') {
    const row = data;
    if (!row?.video_id || row.channel == null) {
      return NextResponse.json({ error: 'video_id and channel required' }, { status: 400 });
    }
    const patch = {};
    if ('starred' in row) patch.starred = Boolean(row.starred);
    if ('user_note' in row) patch.user_note = row.user_note;
    if ('channel_id' in row) patch.channel_id = row.channel_id;
    if ('read_at' in row) patch.read_at = row.read_at;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
    }
    const { error } = await supabase
      .from('digest_results')
      .update(patch)
      .eq('video_id', row.video_id)
      .eq('channel', row.channel);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (resource === 'purge') {
    const expected = process.env.DIGEST_PURGE_SECRET;
    const secret = data?.secret;
    const token = data?.confirmToken;
    if (expected) {
      if (secret !== expected) {
        return NextResponse.json({ error: 'Invalid purge secret' }, { status: 401 });
      }
    } else if (token !== 'DELETE_ALL_DIGEST_DATA') {
      return NextResponse.json({ error: 'Confirmation token required' }, { status: 400 });
    }
    const delRes = await supabase.from('digest_results').delete().not('video_id', 'is', null);
    if (delRes.error) return NextResponse.json({ error: delRes.error.message }, { status: 500 });
    const delCh = await supabase.from('channels').delete().neq('id', '___placeholder___');
    if (delCh.error) return NextResponse.json({ error: delCh.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'invalid resource' }, { status: 400 });
}

export async function DELETE(req) {
  let supabase;
  try { supabase = getServiceSupabase(); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource');
  const videoId = searchParams.get('videoId');
  const channel = searchParams.get('channel');

  if (resource === 'results' && videoId && channel) {
    const { error } = await supabase
      .from('digest_results')
      .delete()
      .eq('video_id', videoId)
      .eq('channel', channel);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (resource === 'results_by_channel') {
    const channelId = searchParams.get('channelId');
    const channelName = searchParams.get('channel');
    if (!channelId && !channelName) {
      return NextResponse.json({ error: 'channelId or channel required' }, { status: 400 });
    }
    if (channelId) {
      const { error } = await supabase.from('digest_results').delete().eq('channel_id', channelId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (channelName) {
      const { error } = await supabase.from('digest_results').delete().eq('channel', channelName);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'missing or invalid params' }, { status: 400 });
}
