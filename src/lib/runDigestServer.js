import { randomUUID } from 'crypto';
import { loadChannelVideos } from '@/lib/youtubeVideos';
import {
  decodeHtmlEntities,
  extractHashtagsFromText,
  mergeTagArrays,
} from '@/lib/digestText';

function abortIfNeeded(signal) {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

const SYSTEM_PROMPT = `You are a dynamic YouTube tech and education digest agent. Your job is to analyze real recent YouTube videos and summarize them.

Given a list of real video metadata, return a JSON array of video analysis objects. Do not hallucinate videos. Simply analyze the provided videos.

Each object must have:
- id: string (unique)
- videoId: string (must match the input videoId exactly)
- title: string (must match the input title exactly; use plain Unicode text, never HTML entities like &#39; for apostrophes)
- channel: string (must match the input channel/author exactly)
- publishedAt: string (must match the input published date)
- tags: array of strings. Generate 2 to 4 highly specific fine-grained subject tags based on the topic (e.g. "music theory", "chords", "react", "testing", "ai models"). Do not use broad terms like "General". Hashtags in the video description (e.g. #piano) are merged into tags automatically on the client—you may still output subject tags.
- summary: string (2-3 concise sentence summary of what the video covers based on its description)
- keyPoints: number (estimated number of key takeaways, 3-6)

Return ONLY a valid JSON array, no other text.`;

async function callAnthropic({ userPrompt, signal }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 12000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic API error ${res.status}`);
  }
  return res.json();
}

/**
 * @param {object} opts
 * @param {{ id: string, name: string }[]} opts.channels
 * @param {string} opts.since
 * @param {boolean} [opts.forceRefresh]
 * @param {string[]} [opts.existingVideoIds]
 * @param {AbortSignal} [opts.signal]
 * @param {(msg: string) => void} [opts.onStatus]
 */
export async function runDigestServerSide({
  channels,
  since,
  forceRefresh = false,
  existingVideoIds = [],
  signal,
  onStatus = () => {},
}) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not configured');
  }

  abortIfNeeded(signal);

  const excludePayload =
    forceRefresh || !existingVideoIds.length
      ? { forceRefresh: Boolean(forceRefresh), excludeVideoIds: [] }
      : { forceRefresh: false, excludeVideoIds: existingVideoIds };

  onStatus(
    excludePayload.forceRefresh
      ? `Fetching videos from ${channels.length} channel(s) (full YouTube fetch)…`
      : existingVideoIds.length
        ? `Fetching videos from ${channels.length} channel(s) (skipping ${existingVideoIds.length} already in digest)…`
        : `Fetching videos from ${channels.length} channel(s) in parallel…`
  );

  const results = await Promise.allSettled(
    channels.map((c) =>
      loadChannelVideos(
        c.id,
        since,
        apiKey,
        excludePayload.forceRefresh ? null : new Set(excludePayload.excludeVideoIds)
      )
    )
  );

  abortIfNeeded(signal);

  let allVideos = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      const cid = channels[i].id;
      for (const vid of r.value) {
        allVideos.push({ ...vid, channelId: vid.channelId ?? cid });
      }
    } else if (r.status === 'rejected') {
      const msg = r.reason?.name === 'AbortError' ? 'cancelled' : r.reason?.message;
      errors.push(`${channels[i].name}: ${msg}`);
    }
  });

  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (allVideos.length === 0) {
    const detail = errors.length ? ` Errors: ${errors.join('; ')}` : '';
    throw new Error(`No videos found for "${since}" timeframe.${detail}`);
  }

  const processedVideos = [];
  const chunkSize = 20;

  for (let i = 0; i < allVideos.length; i += chunkSize) {
    abortIfNeeded(signal);
    const chunk = allVideos.slice(i, i + chunkSize);
    onStatus(
      `Agent analyzing batch ${Math.ceil(i / chunkSize) + 1}/${Math.ceil(allVideos.length / chunkSize)}…`
    );

    const videoContext = chunk
      .map(
        (v, idx) =>
          `[Video ${idx + 1}] ID: ${v.videoId} | Channel: ${v.author} | Title: ${v.title} | Published: ${v.publishedAt}\nDescription: ${(v.description || '').slice(0, 350)}...`
      )
      .join('\n\n');

    const userPrompt = `Here are the latest videos fetched from the selected channels:\n\n${videoContext}\n\nAnalyze them and generate the video digest JSON array now.`;

    const data = await callAnthropic({ userPrompt, signal });
    const text =
      data.content?.find((b) => b.type === 'text')?.text || data.text || '';

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        const byVideoId = new Map(chunk.map((x) => [x.videoId, x]));
        for (const v of parsed) {
          const src = byVideoId.get(v.videoId);
          const desc = src?.description ?? '';
          const tagsMerged = mergeTagArrays(
            Array.isArray(v.tags) ? v.tags : [],
            extractHashtagsFromText(desc)
          );
          const enriched = {
            ...v,
            id: v.id || randomUUID(),
            title: decodeHtmlEntities(v.title ?? ''),
            description: desc,
            tags: tagsMerged,
            channelId: src?.channelId ?? null,
            channel: decodeHtmlEntities(
              v.channel || src?.author || v.channel || ''
            ),
            starred: false,
            userNote: '',
            readAt: null,
          };
          processedVideos.push(enriched);
        }
      }
    } catch {
      console.error('Could not parse batch');
    }
  }

  onStatus(`Done — ${processedVideos.length} videos analyzed & tagged`);
  return { processedVideos, errors };
}
