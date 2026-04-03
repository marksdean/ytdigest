import { NextResponse } from 'next/server';
import { requireAgentAuth } from '@/lib/agentAuth';
import { getServiceSupabase } from '@/lib/supabaseAdmin';
import { inferChannelsFromVideos } from '@/lib/inferChannelsFromVideos';

export async function GET(req) {
  const denied = requireAgentAuth(req);
  if (denied) return denied;

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  const { data, error } = await supabase.from('channels').select('*').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let channels = data ?? [];
  if (channels.length === 0) {
    const { data: digestRows, error: digestErr } = await supabase
      .from('digest_results')
      .select('channel_id, channel');
    if (!digestErr && digestRows?.length) {
      const pseudo = digestRows.map((r) => ({
        channelId: r.channel_id,
        channel: r.channel,
      }));
      channels = inferChannelsFromVideos(pseudo)
        .map((c) => ({
          id: c.id,
          name: c.name,
          thumbnail_url: c.thumbnailUrl ?? null,
          inferred: true,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return NextResponse.json({ channels });
}

/**
 * POST body: { channels: [{ id, name, thumbnail_url? }], mode?: 'merge' | 'replace' }
 * Default mode is merge (by channel id).
 */
export async function POST(req) {
  const denied = requireAgentAuth(req);
  if (denied) return denied;

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incoming = body.channels;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return NextResponse.json({ error: 'channels array required' }, { status: 400 });
  }

  const mode = body.mode === 'replace' ? 'replace' : 'merge';

  const normalized = incoming.map((c) => ({
    id: String(c.id).trim(),
    name: String(c.name ?? '').trim() || String(c.id),
    thumbnail_url: c.thumbnail_url ?? c.thumbnailUrl ?? null,
  })).filter((c) => c.id);

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'no valid channels' }, { status: 400 });
  }

  if (mode === 'replace') {
    await supabase.from('channels').delete().neq('id', '___placeholder___');
    const { error } = await supabase.from('channels').insert(normalized);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: normalized.length });
  }

  const { data: existing, error: loadErr } = await supabase.from('channels').select('*');
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const byId = new Map((existing ?? []).map((row) => [row.id, { ...row }]));
  for (const c of normalized) {
    const prev = byId.get(c.id);
    byId.set(c.id, {
      id: c.id,
      name: c.name || prev?.name || c.id,
      thumbnail_url: c.thumbnail_url ?? prev?.thumbnail_url ?? null,
    });
  }

  const merged = [...byId.values()];
  await supabase.from('channels').delete().neq('id', '___placeholder___');
  const { error } = await supabase.from('channels').insert(merged);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: merged.length });
}
