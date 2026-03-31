import { NextResponse } from 'next/server';
import ytSearch from 'yt-search';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  try {
    const listId = channelId.replace(/^UC/, 'UU');
    const playlist = await ytSearch({ listId }).catch(() => null);

    if (!playlist || !playlist.videos) {
      return NextResponse.json({ videos: [] });
    }

    // Process up to 100 videos maximum to restrict Vercel timeouts
    const topVideos = playlist.videos.slice(0, 100);

    // Chunk fetching dates to bypass YouTube rate limits
    const detailed = [];
    for (let i = 0; i < topVideos.length; i += 20) {
      const chunk = topVideos.slice(i, i + 20);
      const res = await Promise.all(chunk.map(v => ytSearch({ videoId: v.videoId }).catch(() => null)));
      detailed.push(...res);
    }

    const videos = topVideos.map((entry, index) => {
      const d = detailed[index];
      return {
        videoId: entry.videoId,
        title: entry.title,
        author: entry.author?.name || playlist.title || 'Unknown Author',
        publishedAt: d?.uploadDate ? new Date(d.uploadDate).toISOString() : new Date().toISOString(),
        description: d?.description || entry.title,
      };
    });

    return NextResponse.json({ videos });
  } catch (error) {
    console.error('Error fetching channel feed:', error);
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}
