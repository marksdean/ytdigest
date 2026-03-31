import { NextResponse } from 'next/server';

const TIMEFRAME_DAYS = {
  '24 hours': 1, '3 days': 3, '7 days': 7, '1 month': 30,
  '6 months': 182, '1 year': 365, '2 years': 730, '5 years': 1825,
};

/** search.list and playlistItems often return truncated snippets; videos.list has the full description (1 quota / 50 ids). */
async function mergeFullDescriptions(apiKey, videos) {
  const ids = [...new Set(videos.map((v) => v.videoId).filter(Boolean))];
  if (ids.length === 0) return videos;

  const descById = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      `https://youtube.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.map(encodeURIComponent).join(',')}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'videos.list enrichment failed');
    for (const item of data.items || []) {
      descById.set(item.id, item.snippet?.description || '');
    }
  }

  return videos.map((v) => ({
    ...v,
    description: descById.get(v.videoId) ?? v.description ?? '',
  }));
}

/**
 * @param {Set<string>|null} excludeIds - null = do not exclude (force refresh). Empty set = exclude nothing.
 */
function applyExclude(videos, excludeIds) {
  if (excludeIds == null) return videos;
  return videos.filter((v) => v.videoId && !excludeIds.has(v.videoId));
}

/**
 * @returns {{ forceRefresh: boolean, excludeIds: Set<string>|null }}
 */
function parseExcludeOptions(searchParams) {
  const force =
    searchParams.get('forceRefresh') === '1' ||
    searchParams.get('forceRefresh') === 'true';
  if (force) {
    return { forceRefresh: true, excludeIds: null };
  }
  const raw = searchParams.get('excludeVideoIds');
  if (!raw || !raw.trim()) {
    return { forceRefresh: false, excludeIds: new Set() };
  }
  const excludeIds = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return { forceRefresh: false, excludeIds };
}

async function loadChannelVideos(channelId, since, apiKey, excludeIds) {
  const cutoff = TIMEFRAME_DAYS[since]
    ? new Date(Date.now() - TIMEFRAME_DAYS[since] * 86400000)
    : null;

  if (cutoff) {
    const publishedAfter = cutoff.toISOString();
    let videos = [];
    let pageToken = '';

    for (let page = 0; page < 20; page++) {
      const url =
        `https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}` +
        `&type=video&order=date&publishedAfter=${encodeURIComponent(publishedAfter)}` +
        `&maxResults=50&key=${apiKey}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.message || 'search API error');
      if (!data.items?.length) break;

      for (const item of data.items) {
        const vid = item.id?.videoId;
        const title = item.snippet?.title;
        if (!vid) continue;
        if (title === 'Deleted video' || title === 'Private video') continue;

        const publishedAt = item.snippet?.publishedAt;
        videos.push({
          videoId: vid,
          title,
          author: item.snippet?.channelTitle || 'Unknown Author',
          channelId,
          publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
          description: item.snippet?.description || '',
        });
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    videos = applyExclude(videos, excludeIds);
    videos = await mergeFullDescriptions(apiKey, videos);
    return videos;
  }

  const chRes = await fetch(
    `https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
  );
  const chData = await chRes.json();
  if (!chRes.ok) throw new Error(chData.error?.message || 'Channel lookup failed');
  if (!chData.items?.length) throw new Error(`Channel not found: ${channelId}`);

  const uploadsPlaylistId = chData.items[0].contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error('No uploads playlist found for channel');

  let videos = [];
  let pageToken = '';

  for (let page = 0; page < 10; page++) {
    const url =
      `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}` +
      `&maxResults=50&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error?.message || 'playlistItems API error');
    if (!data.items?.length) break;

    for (const item of data.items) {
      if (item.snippet?.title === 'Deleted video' || item.snippet?.title === 'Private video') continue;

      const publishedAt =
        item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt;

      videos.push({
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet.title,
        author: item.snippet.videoOwnerChannelTitle || 'Unknown Author',
        channelId,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
        description: item.snippet.description || '',
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  videos = applyExclude(videos, excludeIds);
  videos = await mergeFullDescriptions(apiKey, videos);
  return videos;
}

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
