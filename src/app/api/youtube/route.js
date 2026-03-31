import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');
  const since = searchParams.get('since') || 'All time';
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY missing from environment variables' }, { status: 500 });
  }

  // Map timeframe to publishedAfter for YouTube API (server-side filtering)
  const now = new Date();
  let publishedAfter = null;
  const TIMEFRAMES = {
    '24 hours': 1, '3 days': 3, '7 days': 7, '1 month': 30,
    '6 months': 182, '1 year': 365, '2 years': 730, '5 years': 1825,
  };
  if (TIMEFRAMES[since]) {
    publishedAfter = new Date(now - TIMEFRAMES[since] * 24 * 60 * 60 * 1000);
  }

  try {
    let videos = [];
    let pageToken = '';

    // Max 3 pages = 150 videos per channel to stay within Vercel's 10s timeout.
    // The publishedAfter filter ensures YouTube only returns relevant date-ranged videos,
    // so 150 per channel is sufficient for any timeframe up to 2 years.
    for (let i = 0; i < 3; i++) {
      let url = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${apiKey}`;
      if (publishedAfter) url += `&publishedAfter=${publishedAfter.toISOString()}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'YouTube API error');
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) break;

      videos.push(...data.items.map(item => ({
        videoId: item.id?.videoId,
        title: item.snippet?.title,
        author: item.snippet?.channelTitle || 'Unknown Author',
        publishedAt: item.snippet?.publishedAt
          ? new Date(item.snippet.publishedAt).toISOString()
          : new Date().toISOString(),
        description: item.snippet?.description || '',
      })));

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return NextResponse.json({ videos });
  } catch (error) {
    console.error('Error fetching YouTube API:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch videos' }, { status: 500 });
  }
}
