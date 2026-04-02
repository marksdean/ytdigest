import { NextResponse } from 'next/server';
import { requireAgentAuth } from '@/lib/agentAuth';

export async function GET(req) {
  const denied = requireAgentAuth(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY missing' }, { status: 500 });
  }

  const maxResults = Math.min(
    50,
    Math.max(1, Number.parseInt(searchParams.get('maxResults') || '10', 10) || 10)
  );

  try {
    const url =
      `https://youtube.googleapis.com/youtube/v3/search?part=snippet&type=channel` +
      `&q=${encodeURIComponent(q)}&maxResults=${maxResults}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'YouTube search failed' },
        { status: 500 }
      );
    }

    const items = (data.items || []).map((item) => {
      const id = item.id?.channelId || item.snippet?.channelId;
      const thumbs = item.snippet?.thumbnails;
      const thumbnailUrl =
        thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url || null;
      return {
        channelId: id,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        thumbnailUrl,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e.message || 'Search failed' },
      { status: 500 }
    );
  }
}
