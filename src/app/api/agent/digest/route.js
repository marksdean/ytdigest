import { NextResponse } from 'next/server';
import { requireAgentAuth } from '@/lib/agentAuth';
import { getServiceSupabase } from '@/lib/supabaseAdmin';
import { mergeDigestRowsFromDatabase } from '@/lib/digestMerge';
import { runDigestServerSide } from '@/lib/runDigestServer';

/** Allow long server-side digests on Vercel (requires compatible plan). */
export const maxDuration = 300;

async function existingVideoIdsForChannels(supabase, channelIds, channelRows) {
  const selectedIds = new Set(channelIds);
  const selectedNames = new Set(channelRows.map((c) => c.name));
  const { data: priorVideos } = await supabase
    .from('digest_results')
    .select('video_id, channel_id, channel');

  return [
    ...new Set(
      (priorVideos || [])
        .filter((v) => {
          if (v.channel_id && selectedIds.has(v.channel_id)) return true;
          return selectedNames.has(v.channel);
        })
        .map((v) => v.video_id)
        .filter(Boolean)
    ),
  ];
}

/**
 * POST body: { since?: string, channelIds: string[], save?: boolean, forceRefresh?: boolean }
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

  const channelIds = Array.isArray(body.channelIds)
    ? body.channelIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (channelIds.length === 0) {
    return NextResponse.json({ error: 'channelIds required' }, { status: 400 });
  }

  const since = body.since || '1 month';
  const save = Boolean(body.save);
  const forceRefresh = Boolean(body.forceRefresh);

  const { data: chRows, error: chErr } = await supabase
    .from('channels')
    .select('id, name')
    .in('id', channelIds);

  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });
  const channels = chRows ?? [];
  if (channels.length === 0) {
    return NextResponse.json(
      { error: 'No matching channels in database for the given ids' },
      { status: 400 }
    );
  }

  const existingVideoIds = forceRefresh
    ? []
    : await existingVideoIdsForChannels(supabase, channelIds, channels);

  try {
    const { processedVideos } = await runDigestServerSide({
      channels,
      since,
      forceRefresh,
      existingVideoIds,
      signal: req.signal,
    });

    if (save && processedVideos.length > 0) {
      const rows = processedVideos.map((v) => ({
        id: v.id,
        video_id: v.videoId,
        title: v.title,
        channel: v.channel,
        channel_id: v.channelId ?? null,
        published_at: v.publishedAt,
        tags: v.tags,
        summary: v.summary,
        key_points: v.keyPoints,
        description: v.description ?? '',
        starred: false,
        user_note: null,
        read_at: null,
      }));
      const merged = await mergeDigestRowsFromDatabase(rows);
      const { error: upErr } = await supabase
        .from('digest_results')
        .upsert(merged, { onConflict: 'video_id,channel' });
      if (upErr) {
        return NextResponse.json({ error: upErr.message, videos: processedVideos }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      saved: save,
      count: processedVideos.length,
      videos: processedVideos,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      return NextResponse.json({ error: 'Aborted' }, { status: 499 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e.message || 'Digest failed' },
      { status: 500 }
    );
  }
}
