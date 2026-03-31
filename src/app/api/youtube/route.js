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

  // Map timeframe to a publishedAfter date for YouTube API
  const now = new Date();
  let publishedAfter = null;
  if (since === '24 hours') {
    publishedAfter = new Date(now - 1 * 24 * 60 * 60 * 1000);
  } else if (since === '3 days') {
    publishedAfter = new Date(now - 3 * 24 * 60 * 60 * 1000);
  } else if (since === '7 days') {
    publishedAfter = new Date(now - 7 * 24 * 60 * 60 * 1000);
  } else if (since === '1 month') {
    publishedAfter = new Date(now - 30 * 24 * 60 * 60 * 1000);
  } else if (since === '6 months') {
    publishedAfter = new Date(now - 182 * 24 * 60 * 60 * 1000);
  } else if (since === '1 year') {
    publishedAfter = new Date(now - 365 * 24 * 60 * 60 * 1000);
  } else if (since === '2 years') {
    publishedAfter = new Date(now - 730 * 24 * 60 * 60 * 1000);
  } else if (since === '5 years') {
    publishedAfter = new Date(now - 1825 * 24 * 60 * 60 * 1000);
  }
  // 'All time' => no publishedAfter filter

  try {
    let videos = [];
    let pageToken = '';

    // Paginate through the chronological Search API
    // Each page = 50 videos. Max 10 pages = up to 500 videos.
    for (let i = 0; i < 10; i++) {
      let url = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${apiKey}`;
      if (publishedAfter) {
        url += `&publishedAfter=${publishedAfter.toISOString()}`;
      }
      if (pageToken) {
        url += `&pageToken=${pageToken}`;
      }

      const res = await fetch(url);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'YouTube API error');
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) break;

      const mapped = data.items.map(item => ({
        videoId: item.id?.videoId,
        title: item.snippet?.title,
        author: item.snippet?.channelTitle || 'Unknown Author',
        publishedAt: item.snippet?.publishedAt
          ? new Date(item.snippet.publishedAt).toISOString()
          : new Date().toISOString(),
        description: item.snippet?.description || '',
      }));

      videos.push(...mapped);

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return NextResponse.json({ videos });
  } catch (error) {
    console.error('Error fetching YouTube API:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch videos' }, { status: 500 });
  }
}
