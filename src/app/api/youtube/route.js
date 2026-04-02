import { NextResponse } from 'next/server';
import {
  loadChannelVideos,
  parseExcludeOptions,
} from '@/lib/youtubeVideos';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('videoId');
  const channelId = searchParams.get('channelId');
  const since = searchParams.get('since') || 'All time';
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) return NextResponse.json({ error: 'YOUTUBE_API_KEY missing' }, { status: 500 });

  if (videoId && !channelId) {
    try {
      const res = await fetch(
        `https://youtube.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${apiKey}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'videos.list error');
      const desc = data.items?.[0]?.snippet?.description ?? '';
      return NextResponse.json({ description: desc });
    } catch (error) {
      console.error('YouTube API error:', error);
      return NextResponse.json({ error: error.message || 'Failed to fetch video' }, { status: 500 });
    }
  }

  if (!channelId) return NextResponse.json({ error: 'channelId or videoId is required' }, { status: 400 });

  /** Cheap lookup: channel title only (1 quota). Accepts UC… id or handle (with or without @). */
  if (searchParams.get('channelTitleOnly') === '1') {
    try {
      const isChannelId = /^UC[\w-]{22}$/.test(channelId);
      const q = isChannelId
        ? `id=${encodeURIComponent(channelId)}`
        : `forHandle=${encodeURIComponent(channelId.replace(/^@/, ''))}`;
      const res = await fetch(
        `https://youtube.googleapis.com/youtube/v3/channels?part=snippet&${q}&key=${apiKey}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'channels.list failed');
      const item = data.items?.[0];
      const title = item?.snippet?.title;
      const resolvedId = item?.id;
      if (!title || !resolvedId) throw new Error('Channel not found');
      const thumbs = item?.snippet?.thumbnails;
      const thumbnailUrl =
        thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url || null;
      return NextResponse.json({ channelTitle: title, channelId: resolvedId, thumbnailUrl });
    } catch (error) {
      console.error('YouTube API error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to resolve channel' },
        { status: 500 }
      );
    }
  }

  const { forceRefresh, excludeIds } = parseExcludeOptions(searchParams);

  try {
    const videos = await loadChannelVideos(channelId, since, apiKey, forceRefresh ? null : excludeIds);
    return NextResponse.json({ videos });
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch videos' }, { status: 500 });
  }
}

/**
 * POST body: { channelId, since, excludeVideoIds?: string[], forceRefresh?: boolean }
 * Use for large exclude lists (GET query length limits).
 */
export async function POST(req) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'YOUTUBE_API_KEY missing' }, { status: 500 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const channelId = body.channelId;
  const since = body.since || 'All time';
  const forceRefresh = Boolean(body.forceRefresh);

  if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 });

  let excludeIds = null;
  if (forceRefresh) {
    excludeIds = null;
  } else if (Array.isArray(body.excludeVideoIds)) {
    excludeIds = new Set(body.excludeVideoIds.map((id) => String(id).trim()).filter(Boolean));
  } else {
    excludeIds = new Set();
  }

  try {
    const videos = await loadChannelVideos(channelId, since, apiKey, excludeIds);
    return NextResponse.json({ videos });
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch videos' }, { status: 500 });
  }
}
