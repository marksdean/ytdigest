import { NextResponse } from 'next/server';

const TIMEFRAME_DAYS = {
  '24 hours': 1, '3 days': 3, '7 days': 7, '1 month': 30,
  '6 months': 182, '1 year': 365, '2 years': 730, '5 years': 1825,
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');
  const since = searchParams.get('since') || 'All time';
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: 'YOUTUBE_API_KEY missing' }, { status: 500 });

  // Compute cutoff date for server-side early termination
  const cutoff = TIMEFRAME_DAYS[since]
    ? new Date(Date.now() - TIMEFRAME_DAYS[since] * 86400000)
    : null;

  try {
    // Step 1: Resolve the uploads playlist ID for this channel (1 quota unit)
    const chRes = await fetch(
      `https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
    );
    const chData = await chRes.json();
    if (!chRes.ok) throw new Error(chData.error?.message || 'Channel lookup failed');
    if (!chData.items?.length) throw new Error(`Channel not found: ${channelId}`);

    const uploadsPlaylistId = chData.items[0].contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) throw new Error('No uploads playlist found for channel');

    // Step 2: Paginate through playlistItems (1 quota unit per page, vs 100 for search)
    // Stop early when we hit videos older than the cutoff date.
    let videos = [];
    let pageToken = '';
    let reachedCutoff = false;

    for (let page = 0; page < 10 && !reachedCutoff; page++) {
      const url = `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.message || 'playlistItems API error');
      if (!data.items?.length) break;

      for (const item of data.items) {
        const publishedAt = item.snippet?.publishedAt;
        // playlistItems are newest-first; stop once we pass the cutoff
        if (cutoff && publishedAt && new Date(publishedAt) < cutoff) {
          reachedCutoff = true;
          break;
        }
        // Skip deleted/private videos
        if (item.snippet?.title === 'Deleted video' || item.snippet?.title === 'Private video') continue;

        videos.push({
          videoId: item.snippet.resourceId?.videoId,
          title: item.snippet.title,
          author: item.snippet.videoOwnerChannelTitle || 'Unknown Author',
          publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
          description: item.snippet.description || '',
        });
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return NextResponse.json({ videos });
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch videos' }, { status: 500 });
  }
}
