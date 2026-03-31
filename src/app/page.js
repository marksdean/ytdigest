"use client";

import { useState, useEffect, useMemo } from "react";

/** URLs from description / summary: PDFs, external pages, cloud links */
function extractLinksFromText(text) {
  if (!text || typeof text !== "string") return [];
  const seen = new Set();
  const out = [];
  const re = /(https?:\/\/[^\s<>\[\]()]+|www\.[^\s<>\[\]()]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let url = m[0].replace(/[.,;:)]+$/, "");
    if (url.startsWith("www.")) url = `https://${url}`;
    try {
      const u = new URL(url);
      if (seen.has(u.href)) continue;
      seen.add(u.href);
      const host = u.hostname.replace(/^www\./, "");
      const path = u.pathname.toLowerCase();
      let kind = "link";
      if (path.endsWith(".pdf") || u.href.toLowerCase().includes(".pdf")) kind = "pdf";
      else if (/youtube\.com|youtu\.be/i.test(host)) kind = "youtube";
      else if (/drive\.google|dropbox|notion\.|github\.com/i.test(host)) kind = "resource";
      out.push({ url: u.href, host, kind });
    } catch {
      /* ignore */
    }
  }
  return out;
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

  :root {
    --r-bg: #E8E8E8;
    --r-surface: #FFFFFF;
    --r-line: #C8C8C8;
    --r-line-focus: #1A1A1A;
    --r-text: #1A1A1A;
    --r-text-muted: #5A5A5A;
    --r-text-faint: #8A8A8A;
    --r-radius: 2px;
    --r-font: 'Inter', system-ui, sans-serif;
    --r-mono: 'IBM Plex Mono', ui-monospace, monospace;
    --rDigestH: min(70vh, 900px);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--r-font);
    background: var(--r-bg);
    color: var(--r-text);
    -webkit-font-smoothing: antialiased;
  }

  .root {
    max-width: 1320px;
    margin: 0 auto;
    padding: 2rem 1.75rem 3rem;
  }

  .r-label {
    font-family: var(--r-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--r-text-faint);
  }

  .header { margin-bottom: 2rem; border-bottom: 1px solid var(--r-line); padding-bottom: 1.25rem; }
  .header h1 {
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--r-text);
    line-height: 1.2;
  }
  .header p { font-size: 13px; color: var(--r-text-muted); margin-top: 8px; max-width: 52ch; line-height: 1.5; }

  .panel {
    background: var(--r-surface);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    padding: 1.25rem 1.35rem;
    margin-bottom: 1rem;
  }

  .channel-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--r-line);
    font-size: 13px;
  }
  .channel-row:last-child { border-bottom: none; }
  .channel-line { width: 3px; height: 14px; background: var(--r-text); flex-shrink: 0; }
  .channel-name { font-weight: 500; color: var(--r-text); flex: 1; }
  .channel-id { font-family: var(--r-mono); font-size: 10px; color: var(--r-text-faint); }
  .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--r-text-faint);
    font-size: 18px;
    line-height: 1;
    padding: 4px 6px;
  }
  .remove-btn:hover { color: var(--r-text); }

  .add-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .add-row input {
    flex: 1;
    min-width: 140px;
    height: 36px;
    background: var(--r-bg);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    padding: 0 12px;
    font-size: 13px;
    color: var(--r-text);
    outline: none;
    font-family: var(--r-font);
  }
  .add-row input:focus { border-color: var(--r-line-focus); }

  .btn {
    height: 36px;
    padding: 0 18px;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--r-text);
    font-family: var(--r-font);
  }
  .btn:hover { background: var(--r-bg); }
  .btn.primary {
    background: var(--r-text);
    color: var(--r-surface);
    border-color: var(--r-text);
  }
  .btn.primary:hover { opacity: 0.92; }
  .btn.primary:disabled { opacity: 0.35; cursor: not-allowed; }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    margin-bottom: 1rem;
  }
  .toolbar-grow { flex: 1; min-width: 8px; }

  .r-select {
    height: 36px;
    padding: 0 10px;
    background: var(--r-surface);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    font-size: 12px;
    color: var(--r-text);
    font-family: var(--r-font);
    outline: none;
  }
  .r-select:focus { border-color: var(--r-line-focus); }

  .seg {
    display: inline-flex;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    overflow: hidden;
  }
  .seg button {
    padding: 0 14px;
    height: 34px;
    border: none;
    background: var(--r-surface);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--r-text-muted);
    cursor: pointer;
    font-family: var(--r-font);
  }
  .seg button + button { border-left: 1px solid var(--r-line); }
  .seg button.is-on {
    background: var(--r-text);
    color: var(--r-surface);
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    font-size: 12px;
    margin-bottom: 1rem;
    background: var(--r-surface);
  }
  .status-bar.running { border-color: var(--r-text-faint); }
  .status-bar.error { border-color: var(--r-text); }
  .status-bar.success { border-color: var(--r-line-focus); }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--r-line);
    border-top-color: var(--r-text);
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .tag-panel {
    background: var(--r-surface);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .tag-panel-top {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }
  .tag-search {
    flex: 1;
    min-width: 160px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    font-size: 12px;
    font-family: var(--r-font);
    outline: none;
  }
  .tag-search:focus { border-color: var(--r-line-focus); }
  .tag-bank {
    max-height: 112px;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-content: flex-start;
    padding: 2px 0;
  }
  .tag-bank::-webkit-scrollbar { width: 6px; }
  .tag-bank::-webkit-scrollbar-thumb { background: var(--r-line); border-radius: 3px; }

  .filter-chip {
    font-size: 11px;
    padding: 5px 10px;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface);
    cursor: pointer;
    color: var(--r-text-muted);
    font-family: var(--r-mono);
    max-width: 100%;
  }
  .filter-chip.active {
    background: var(--r-text);
    color: var(--r-surface);
    border-color: var(--r-text);
  }
  .filter-chip:hover:not(.active) { border-color: var(--r-text-faint); }

  .digest-scroll {
    max-height: var(--rDigestH);
    overflow-y: auto;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface);
    scrollbar-width: thin;
    scrollbar-color: var(--r-line) transparent;
  }
  .digest-scroll::-webkit-scrollbar { width: 8px; }
  .digest-scroll::-webkit-scrollbar-thumb { background: var(--r-line); }

  .digest-list { display: flex; flex-direction: column; gap: 0; }

  .digest-grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
    gap: 1px;
    background: var(--r-line);
    align-content: start;
  }

  .video-card {
    background: var(--r-surface);
    border-bottom: 1px solid var(--r-line);
    padding: 1.15rem 1.25rem;
  }
  .digest-list .video-card:last-child { border-bottom: none; }

  .video-card--grid {
    border: none;
    padding: 14px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-bottom: none;
  }
  .video-card--grid .card-top {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 8px;
    gap: 10px;
  }
  .video-card--grid .thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 16/9;
  }
  .video-card--grid .card-title {
    font-size: 13px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .video-card--grid .summary-text {
    font-size: 11px;
    -webkit-line-clamp: 4;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-top { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 12px; }
  .thumb {
    width: 120px;
    height: 68px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid var(--r-line);
    background: var(--r-bg);
  }

  .card-meta { flex: 1; min-width: 0; }
  .card-title { font-size: 15px; font-weight: 500; line-height: 1.35; color: var(--r-text); margin-bottom: 6px; }
  .card-channel {
    font-family: var(--r-mono);
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--r-text-faint);
  }

  .card-tags-scroll {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 6px;
    margin-bottom: 10px;
    scrollbar-width: thin;
  }
  .card-tags-scroll::-webkit-scrollbar { height: 4px; }
  .badge {
    font-family: var(--r-mono);
    font-size: 10px;
    padding: 4px 8px;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    color: var(--r-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .badge.date { color: var(--r-text-faint); }

  .summary-text { font-size: 13px; color: var(--r-text-muted); line-height: 1.6; margin-bottom: 8px; }

  .r-expand { margin-top: 4px; }
  .r-expand-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 8px 0;
    border: none;
    border-top: 1px solid var(--r-line);
    background: none;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--r-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--r-text);
  }
  .r-expand-btn:hover { color: var(--r-text-muted); }
  .r-chevron {
    display: inline-block;
    font-size: 14px;
    line-height: 1;
    transition: transform 0.15s ease;
    color: var(--r-text-faint);
  }
  .r-chevron.open { transform: rotate(90deg); }
  .r-expand-body {
    padding: 0 0 12px;
    font-size: 12px;
    line-height: 1.65;
    color: var(--r-text-muted);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .link-list { list-style: none; }
  .link-list li { margin-bottom: 8px; }
  .link-list a {
    font-size: 12px;
    color: var(--r-text);
    text-decoration: underline;
    text-underline-offset: 3px;
    word-break: break-all;
  }
  .link-list a:hover { opacity: 0.7; }
  .link-kind {
    font-family: var(--r-mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--r-text-faint);
    margin-bottom: 2px;
  }

  .card-footer {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--r-line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .watch-link {
    font-size: 12px;
    font-weight: 500;
    color: var(--r-text);
    text-decoration: none;
    letter-spacing: 0.02em;
  }
  .watch-link:hover { text-decoration: underline; text-underline-offset: 3px; }
  .key-points { font-family: var(--r-mono); font-size: 10px; color: var(--r-text-faint); }

  .empty-state { text-align: center; padding: 3rem 1rem; color: var(--r-text-faint); }
  .empty-state p { font-size: 13px; margin-top: 10px; max-width: 36ch; margin-left: auto; margin-right: auto; line-height: 1.5; }
  .big-icon { font-size: 28px; margin-bottom: 6px; opacity: 0.4; }
`;

async function runAgent({ channels, since, onStatus, onVideo }) {
  onStatus(`Fetching videos from ${channels.length} channel(s) in parallel...`, "running");

  // Fetch all channels in parallel to avoid Vercel timeout
  const results = await Promise.allSettled(
    channels.map(c =>
      fetch(`/api/youtube?channelId=${c.id}&since=${encodeURIComponent(since)}`)
        .then(res => {
          if (!res.ok) return res.json().then(e => { throw new Error(e.error || `HTTP ${res.status}`); });
          return res.json();
        })
    )
  );

  let allVideos = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.videos) {
      allVideos.push(...r.value.videos);
    } else if (r.status === 'rejected') {
      errors.push(`${channels[i].name}: ${r.reason?.message}`);
    }
  });

  if (allVideos.length === 0) {
    const detail = errors.length ? ` Errors: ${errors.join('; ')}` : '';
    throw new Error(`No videos found for "${since}" timeframe.${detail}`);
  }

  const systemPrompt = `You are a dynamic YouTube tech and education digest agent. Your job is to analyze real recent YouTube videos and summarize them.

Given a list of real video metadata, return a JSON array of video analysis objects. Do not hallucinate videos. Simply analyze the provided videos.

Each object must have:
- id: string (unique)
- videoId: string (must match the input videoId exactly)
- title: string (must match the input title)
- channel: string (must match the input channel/author exactly)
- publishedAt: string (must match the input published date)
- tags: array of strings. Generate 2 to 4 highly specific fine-grained subject tags based on the topic (e.g. "music theory", "chords", "react", "testing", "ai models"). Do not use broad terms like "General".
- summary: string (2-3 concise sentence summary of what the video covers based on its description)
- keyPoints: number (estimated number of key takeaways, 3-6)

Return ONLY a valid JSON array, no other text.`;

  let processedVideos = [];
  const chunkSize = 20;

  for (let i = 0; i < allVideos.length; i += chunkSize) {
    const chunk = allVideos.slice(i, i + chunkSize);
    onStatus(`Agent analyzing batch ${Math.ceil(i/chunkSize)+1}/${Math.ceil(allVideos.length/chunkSize)}...`, "running");

    const videoContext = chunk.map((v, idx) =>
      `[Video ${idx + 1}] ID: ${v.videoId} | Channel: ${v.author} | Title: ${v.title} | Published: ${v.publishedAt}\nDescription: ${(v.description || "").slice(0, 350)}...`
    ).join("\n\n");

    const userPrompt = `Here are the latest videos fetched from the selected channels:\n\n${videoContext}\n\nAnalyze them and generate the video digest JSON array now.`;

    const res = await fetch("/api/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 12000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `API error ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || data.text || "";

    try {
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        const byVideoId = new Map(chunk.map((x) => [x.videoId, x]));
        for (const v of parsed) {
          const src = byVideoId.get(v.videoId);
          const enriched = { ...v, description: src?.description ?? "" };
          processedVideos.push(enriched);
          onVideo(enriched);
        }
      }
    } catch {
      console.error("Could not parse batch");
    }
  }

  onStatus(`Done — ${processedVideos.length} videos analyzed & tagged`, "success");
}

// Helper: call the Supabase proxy
async function sbFetch(resource, method = 'GET', data = null) {
  const url = `/api/supabase?resource=${resource}`;
  if (method === 'GET') {
    const res = await fetch(url);
    return res.ok ? res.json() : null;
  }
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource, data }),
  });
}

export default function App() {
  const [channels, setChannels] = useState([]);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [since, setSince] = useState("1 month");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("running");
  const [videos, setVideos] = useState([]);
  const [dbReady, setDbReady] = useState(false);
  
  // Sorting & Filtering
  const [tagFilter, setTagFilter] = useState("All");
  const [channelFilter, setChannelFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Date (Newest)");
  const [viewMode, setViewMode] = useState("list");
  const [tagQuery, setTagQuery] = useState("");
  const [openDesc, setOpenDesc] = useState({});
  const [openLinks, setOpenLinks] = useState({});

  // Load persisted channels and results from Supabase on mount
  useEffect(() => {
    async function loadFromSupabase() {
      const [chRes, resRes] = await Promise.all([
        sbFetch('channels'),
        sbFetch('results'),
      ]);
      if (chRes?.channels) {
        setChannels(chRes.channels.map((c) => ({ id: c.id, name: c.name })));
      }
      if (resRes?.results?.length > 0) {
        const mapped = resRes.results.map(r => ({
          id: r.id,
          videoId: r.video_id,
          title: r.title,
          channel: r.channel,
          publishedAt: r.published_at,
          tags: r.tags || [],
          summary: r.summary,
          keyPoints: r.key_points,
          description: r.description ?? "",
        }));
        setVideos(mapped);
      }
      setDbReady(true);
    }
    loadFromSupabase().catch(() => {
      // Supabase not configured yet — fall back silently
      setDbReady(false);
    });
  }, []);

  const addChannel = () => {
    if (!newName.trim() || !newId.trim()) return;
    setChannels(c => [...c, { id: newId.trim(), name: newName.trim() }]);
    setNewName(""); setNewId("");
  };

  const removeChannel = async (id) => {
    const updated = channels.filter(ch => ch.id !== id);
    setChannels(updated);
    if (dbReady) {
      await sbFetch('channels', 'POST', updated.map(c => ({ id: c.id, name: c.name })));
    }
  };

  const deleteResult = async (videoId, channel) => {
    setVideos(prev => prev.filter(v => !(v.videoId === videoId && v.channel === channel)));
    if (dbReady) {
      await fetch(`/api/supabase?resource=results&videoId=${encodeURIComponent(videoId)}&channel=${encodeURIComponent(channel)}`, { method: 'DELETE' });
    }
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(videos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ytdigest-${new Date().toISOString().slice(0,10)}.json`; a.click();
  };

  const exportMarkdown = () => {
    const md = videos.map(v =>
      `## ${v.title}\n**Channel:** ${v.channel}  \n**Published:** ${new Date(v.publishedAt).toLocaleDateString()}  \n**Tags:** ${(v.tags||[]).join(', ')}  \n**Watch:** https://www.youtube.com/watch?v=${v.videoId}\n\n${v.summary}\n`
    ).join('\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ytdigest-${new Date().toISOString().slice(0,10)}.md`; a.click();
  };

  const handleRun = async () => {
    if (channels.length === 0) return;
    setRunning(true);
    // Do NOT clear videos — results accumulate (append-only)
    setTagFilter("All");
    setChannelFilter("All");

    const newVideos = [];

    try {
      // Persist updated channel list to Supabase
      if (dbReady) {
        await sbFetch('channels', 'POST', channels.map(c => ({ id: c.id, name: c.name })));
      }

      await runAgent({
        channels,
        since,
        onStatus: (msg, type) => { setStatus(msg); setStatusType(type); },
        onVideo: (v) => {
          newVideos.push(v);
          setVideos(prev => {
            const exists = prev.find(p => p.videoId === v.videoId && p.channel === v.channel);
            return exists ? prev : [...prev, v];
          });
        },
      });

      // Persist new results to Supabase (append-only upsert)
      if (dbReady && newVideos.length > 0) {
        const rows = newVideos.map(v => ({
          id: v.id,
          video_id: v.videoId,
          title: v.title,
          channel: v.channel,
          published_at: v.publishedAt,
          tags: v.tags,
          summary: v.summary,
          key_points: v.keyPoints,
          description: v.description ?? "",
        }));
        await sbFetch('results', 'POST', rows);
      }

      setStatusType("success");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setStatusType("error");
    } finally {
      setRunning(false);
    }
  };

  const allTags = useMemo(
    () => ["All", ...new Set(videos.flatMap((v) => v.tags || []))].filter(Boolean),
    [videos]
  );

  const tagsForBank = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return allTags.filter((t) => t === "All" || t.toLowerCase().includes(q));
  }, [allTags, tagQuery]);

  const allChannels = useMemo(
    () => ["All", ...new Set(videos.map((v) => v.channel))].filter(Boolean),
    [videos]
  );

  const filtered = useMemo(() => {
    let list =
      tagFilter === "All" ? [...videos] : videos.filter((v) => v.tags?.includes(tagFilter));
    if (channelFilter !== "All") {
      list = list.filter((v) => v.channel === channelFilter);
    }
    list.sort((a, b) => {
      if (sortBy.includes("Date")) {
        const d1 = new Date(a.publishedAt || 0).getTime();
        const d2 = new Date(b.publishedAt || 0).getTime();
        return sortBy === "Date (Newest)" ? d2 - d1 : d1 - d2;
      }
      if (sortBy === "Author (A-Z)") return a.channel.localeCompare(b.channel);
      if (sortBy === "Author (Z-A)") return b.channel.localeCompare(a.channel);
      return 0;
    });
    return list;
  }, [videos, tagFilter, channelFilter, sortBy]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="root">
        <header className="header">
          <p className="r-label" style={{ marginBottom: 10 }}>YouTube digest</p>
          <h1>Digest agent</h1>
          <p>Fetches channel uploads, summarizes them, and tags entries for filtering. Built for clarity and long lists.</p>
        </header>

        <div className="panel">
          <div className="r-label" style={{ marginBottom: 14 }}>Channels</div>
          {channels.map((ch) => (
            <div className="channel-row" key={ch.id}>
              <div className="channel-line" />
              <span className="channel-name">{ch.name}</span>
              <span className="channel-id">{ch.id}</span>
              <button type="button" className="remove-btn" onClick={() => removeChannel(ch.id)} aria-label="Remove channel">
                ×
              </button>
            </div>
          ))}
          <div className="add-row">
            <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input placeholder="Channel ID (UC…)" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <button type="button" className="btn" onClick={addChannel}>
              Add
            </button>
          </div>
        </div>

        <div className="toolbar">
          <span className="r-label">Timeframe</span>
          <select className="r-select" value={since} onChange={(e) => setSince(e.target.value)}>
            <option>24 hours</option>
            <option>3 days</option>
            <option>7 days</option>
            <option>1 month</option>
            <option>6 months</option>
            <option>1 year</option>
            <option>2 years</option>
            <option>5 years</option>
            <option>All time</option>
          </select>

          {videos.length > 0 && (
            <>
              <span className="r-label">Channel</span>
              <select className="r-select" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
                {allChannels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="r-label">Sort</span>
              <select className="r-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option>Date (Newest)</option>
                <option>Date (Oldest)</option>
                <option>Author (A-Z)</option>
                <option>Author (Z-A)</option>
              </select>
            </>
          )}

          <div className="toolbar-grow" />

          {videos.length > 0 && (
            <>
              <span className="r-label">Layout</span>
              <div className="seg" role="group" aria-label="Result layout">
                <button
                  type="button"
                  className={viewMode === "list" ? "is-on" : ""}
                  onClick={() => setViewMode("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  className={viewMode === "grid" ? "is-on" : ""}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </button>
              </div>
              <button type="button" className="btn" onClick={exportJSON}>
                Export JSON
              </button>
              <button type="button" className="btn" onClick={exportMarkdown}>
                Export MD
              </button>
            </>
          )}

          <button type="button" className="btn primary" onClick={handleRun} disabled={running || channels.length === 0}>
            {running ? "Running…" : "Run digest"}
          </button>
        </div>

        {status && (
          <div className={`status-bar ${statusType}`}>
            {statusType === "running" && <div className="spinner" />}
            <span>{status}</span>
          </div>
        )}

        {videos.length > 0 && (
          <>
            <div className="tag-panel">
              <div className="tag-panel-top">
                <span className="r-label">Tags</span>
                <input
                  className="tag-search"
                  type="search"
                  placeholder="Search tags…"
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  aria-label="Filter tag list"
                />
                <span className="r-label" style={{ marginLeft: "auto" }}>
                  {filtered.length} shown
                </span>
              </div>
              <div className="tag-bank">
                {tagsForBank.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`filter-chip ${tagFilter === tag ? "active" : ""}`}
                    onClick={() => setTagFilter(tag)}
                  >
                    {tag}
                    {tag !== "All" && (
                      <span style={{ marginLeft: 6, opacity: 0.75 }}>
                        ({videos.filter((v) => v.tags?.includes(tag)).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className={`digest-scroll ${viewMode === "grid" ? "digest-grid-view" : "digest-list"}`}>
              {filtered.map((v) => {
                const desc = (v.description || "").trim();
                const hasDesc = desc.length > 0;
                const linkSource = `${v.description || ""}\n${v.summary || ""}`;
                const extraLinks = extractLinksFromText(linkSource).filter(
                  (l) =>
                    !l.url.includes(`watch?v=${v.videoId}`) &&
                    !l.url.includes(`youtu.be/${v.videoId}`)
                );
                const isGrid = viewMode === "grid";
                return (
                  <article
                    key={v.id}
                    className={`video-card ${isGrid ? "video-card--grid" : ""}`}
                  >
                    <div className="card-top">
                      {v.videoId ? (
                        <img
                          className="thumb"
                          src={`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                          alt={v.title}
                        />
                      ) : (
                        <div className="thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          —
                        </div>
                      )}
                      <div className="card-meta">
                        <div className="card-title">{v.title}</div>
                        <div className="card-channel">{v.channel}</div>
                      </div>
                    </div>
                    <div className="card-tags-scroll" aria-label="Tags">
                      {(v.tags || []).map((t) => (
                        <span key={t} className="badge">
                          {t}
                        </span>
                      ))}
                      {v.publishedAt && (
                        <span className="badge date">
                          {new Date(v.publishedAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="summary-text">{v.summary}</p>

                    {hasDesc && (
                      <div className="r-expand">
                        <button
                          type="button"
                          className="r-expand-btn"
                          onClick={() =>
                            setOpenDesc((o) => ({ ...o, [v.id]: !o[v.id] }))
                          }
                        >
                          <span className={`r-chevron ${openDesc[v.id] ? "open" : ""}`}>›</span>
                          Original description
                        </button>
                        {openDesc[v.id] && <div className="r-expand-body">{desc}</div>}
                      </div>
                    )}

                    {extraLinks.length > 0 && (
                      <div className="r-expand">
                        <button
                          type="button"
                          className="r-expand-btn"
                          onClick={() =>
                            setOpenLinks((o) => ({ ...o, [v.id]: !o[v.id] }))
                          }
                        >
                          <span className={`r-chevron ${openLinks[v.id] ? "open" : ""}`}>›</span>
                          Links & downloads ({extraLinks.length})
                        </button>
                        {openLinks[v.id] && (
                          <ul className="link-list r-expand-body">
                            {extraLinks.map((l) => (
                              <li key={l.url}>
                                <div className="link-kind">{l.kind}</div>
                                <a href={l.url} target="_blank" rel="noopener noreferrer">
                                  {l.host}
                                  {l.kind === "pdf" ? " · PDF" : ""}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <div className="card-footer">
                      <a
                        className="watch-link"
                        href={`https://www.youtube.com/watch?v=${v.videoId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open on YouTube
                      </a>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="key-points">{v.keyPoints} key points</span>
                        <button
                          type="button"
                          onClick={() => deleteResult(v.videoId, v.channel)}
                          className="remove-btn"
                          title="Remove"
                          aria-label="Remove result"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {!running && videos.length === 0 && !status && (
          <div className="empty-state">
            <div className="big-icon">□</div>
            <p>Add channels and run the digest. Results stay compact in grid view or scroll in list view.</p>
          </div>
        )}
      </div>
    </>
  );
}
