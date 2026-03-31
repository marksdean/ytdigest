import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY missing from environment variables' }, { status: 500 });
  }

  try {
    let videos = [];
    let pageToken = '';
    
    // Paginate directly through the chronological Search API (max 50 per page, up to 10 pages = 500 videos)
    // The search endpoint natively guarantees flawless Newest->Oldest chronological sorting.
    for (let i = 0; i < 10; i++) {
        const url = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const res = await fetch(url);
        
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error?.message || 'YouTube API permission error');
        }

        const data = await res.json();
        if (!data.items || data.items.length === 0) break;

        const mapped = data.items.map(item => ({
            videoId: item.id?.videoId,
            title: item.snippet?.title,
            author: item.snippet?.channelTitle || 'Unknown Author',
            publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt).toISOString() : new Date().toISOString(),
            description: item.snippet?.description || ''
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
