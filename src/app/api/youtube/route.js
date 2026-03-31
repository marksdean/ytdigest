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
    // Date-bounded windows: use search.list with publishedAfter. It filters by *video publish*
    // time. playlistItems uses snippet.publishedAt = "when the item was added to the playlist"
    // (see API docs), which can disagree with publish date and cause early-exit after 1–2 videos.
    // search.list costs 100 quota units per page vs 1 for playlistItems; cap is ~500 results total.
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
            publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
            description: item.snippet?.description || '',
          });
        }

        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }

      return NextResponse.json({ videos });
    }

    // "All time": cheap playlist walk (1 quota unit per page)
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
