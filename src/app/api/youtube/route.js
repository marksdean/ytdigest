import { NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch YouTube feed.' }, { status: res.status });
    }

    const xmlText = await res.text();
    const result = await parseStringPromise(xmlText);
    
    if (!result || !result.feed || !result.feed.entry) {
        return NextResponse.json({ videos: [] });
    }

    // Get the latest 3 videos per channel to prevent overwhelming the LLM payload
    const entries = result.feed.entry.slice(0, 3);
    const authorName = result.feed.author?.[0]?.name?.[0] || 'Unknown Author';

    const videos = entries.map(entry => {
      return {
        videoId: entry['yt:videoId']?.[0] || '',
        title: entry.title?.[0] || 'Unknown Title',
        author: authorName,
        publishedAt: entry.published?.[0] || '',
        description: entry['media:group']?.[0]?.['media:description']?.[0] || ''
      };
    });

    return NextResponse.json({ videos });

  } catch (err) {
    console.error('Error fetching YouTube RSS:', err);
    return NextResponse.json({ error: 'Internal server error while fetching YouTube RSS' }, { status: 500 });
  }
}
