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
    const listId = channelId.replace(/^UC/, 'UU');
    let videos = [];
    let pageToken = '';
    
    // Paginate through the playlist (max 50 per page, up to 10 pages = 500 videos)
    for (let i = 0; i < 10; i++) {
        const url = `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${listId}&maxResults=50&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const res = await fetch(url);
        
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error?.message || 'YouTube API permission error');
        }

        const data = await res.json();
        if (!data.items || data.items.length === 0) break;

        const mapped = data.items.map(item => ({
            videoId: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            author: item.snippet.videoOwnerChannelTitle || 'Unknown Author',
            publishedAt: new Date(item.snippet.publishedAt).toISOString(),
            description: item.snippet.description
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
