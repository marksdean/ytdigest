"use client";

import { useState, useEffect } from "react";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&display=swap');

  :root {
    --font-sans: 'Inter', system-ui, sans-serif;
    --color-background-primary: #FFFFFF;
    --color-background-secondary: #F9FAFB;
    --color-background-tertiary: #F3F4F6;
    --color-border-primary: #9CA3AF;
    --color-border-secondary: #E5E7EB;
    --color-border-tertiary: #E5E7EB;
    --color-text-primary: #111827;
    --color-text-secondary: #4B5563;
    --color-text-tertiary: #6B7280;
    --color-text-info: #0ea5e9;
    --border-radius-md: 8px;
    --border-radius-lg: 16px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body { font-family: var(--font-sans); background: var(--color-background-tertiary); }

  .root { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }

  .header { margin-bottom: 2.5rem; }
  .header h1 { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; color: var(--color-text-primary); letter-spacing: -0.5px; line-height: 1.2; }
  .header p { color: var(--color-text-secondary); font-size: 14px; margin-top: 6px; }

  .section-label { font-family: 'DM Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--color-text-tertiary); margin-bottom: 10px; }

  .panel { background: var(--color-background-primary); border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg); padding: 1.25rem; margin-bottom: 1.25rem; }

  .channel-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 0.5px solid var(--color-border-tertiary); }
  .channel-row:last-child { border-bottom: none; }
  .channel-dot { width: 8px; height: 8px; border-radius: 50%; background: #1D9E75; flex-shrink: 0; }
  .channel-name { font-size: 14px; font-weight: 500; color: var(--color-text-primary); flex: 1; }
  .channel-id { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--color-text-tertiary); }
  .remove-btn { background: none; border: none; cursor: pointer; color: var(--color-text-tertiary); font-size: 16px; padding: 0 4px; line-height: 1; }
  .remove-btn:hover { color: #E24B4A; }

  .add-row { display: flex; gap: 8px; margin-top: 12px; }
  .add-row input { flex: 1; height: 36px; background: var(--color-background-secondary); border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-md); padding: 0 12px; font-size: 13px; color: var(--color-text-primary); outline: none; }
  .add-row input:focus { border-color: var(--color-border-primary); }
  .add-row input::placeholder { color: var(--color-text-tertiary); }
  .btn { height: 36px; padding: 0 16px; border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-md); background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--color-text-primary); white-space: nowrap; }
  .btn:hover { background: var(--color-background-secondary); }
  .btn:active { transform: scale(0.98); }
  .btn.primary { background: var(--color-text-primary); color: var(--color-background-primary); border-color: var(--color-text-primary); }
  .btn.primary:hover { opacity: 0.88; }
  .btn.primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }


  .status-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: var(--border-radius-md); font-size: 13px; margin-bottom: 1.25rem; }
  .status-bar.running { background: #E6F1FB; color: #185FA5; border: 0.5px solid #B5D4F4; }
  .status-bar.error { background: #FCEBEB; color: #A32D2D; border: 0.5px solid #F7C1C1; }
  .status-bar.success { background: #EAF3DE; color: #3B6D11; border: 0.5px solid #C0DD97; }

  .spinner { width: 14px; height: 14px; border: 2px solid #B5D4F4; border-top-color: #185FA5; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .digest-grid { display: grid; gap: 1rem; }

  .video-card { background: var(--color-background-primary); border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg); padding: 1.25rem; transition: border-color 0.15s; }
  .video-card:hover { border-color: var(--color-border-secondary); }

  .card-top { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
  .thumb { width: 100px; height: 56px; border-radius: 6px; background: var(--color-background-secondary); object-fit: cover; flex-shrink: 0; border: 0.5px solid var(--color-border-tertiary); }

  .card-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .card-title { font-size: 15px; font-weight: 500; color: var(--color-text-primary); line-height: 1.4; margin-bottom: 4px; }
  .card-channel { font-size: 12px; color: var(--color-text-tertiary); font-family: 'DM Mono', monospace; }

  .card-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .badge { font-size: 11px; padding: 3px 8px; border-radius: var(--border-radius-md); font-weight: 500; }
  .badge.cat { background: #E1F5EE; color: #0F6E56; }
  .badge.date { background: var(--color-background-secondary); color: var(--color-text-secondary); font-family: 'DM Mono', monospace; }

  .summary-text { font-size: 13px; color: var(--color-text-secondary); line-height: 1.65; }

  .card-footer { margin-top: 12px; padding-top: 10px; border-top: 0.5px solid var(--color-border-tertiary); display: flex; align-items: center; justify-content: space-between; }
  .watch-link { font-size: 13px; font-weight: 500; color: var(--color-text-info); text-decoration: none; }
  .watch-link:hover { text-decoration: underline; }
  .key-points { font-size: 12px; color: var(--color-text-tertiary); }

  .empty-state { text-align: center; padding: 3rem 1rem; color: var(--color-text-tertiary); }
  .empty-state p { font-size: 14px; margin-top: 8px; }
  .big-icon { font-size: 32px; margin-bottom: 4px; }

  .filter-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .filter-chip { font-size: 12px; padding: 4px 12px; border: 0.5px solid var(--color-border-secondary); border-radius: 100px; background: transparent; cursor: pointer; color: var(--color-text-secondary); }
  .filter-chip.active { background: var(--color-text-primary); color: var(--color-background-primary); border-color: var(--color-text-primary); }
  .filter-chip:hover:not(.active) { background: var(--color-background-secondary); }
`;

const INITIAL_CHANNELS = [
  { id: "UCVHFbw7woebIMSbnRN3IOlA", name: "Fireship" },
  { id: "UCBcRF18a7Qf58cCRy5xuWwQ", name: "Andrej Karpathy" },
  { id: "UCfXgUVnR7UOhr08sT1zRq5A", name: "The Keys Coach" }
];

async function runAgent({ channels, since, onStatus, onVideo }) {
  onStatus(`Fetching videos from YouTube (${since})...`, "running");

  let allVideos = [];
  for (const c of channels) {
    onStatus(`Fetching videos from ${c.name}...`, "running");
    try {
      const res = await fetch(`/api/youtube?channelId=${c.id}&since=${encodeURIComponent(since)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.videos) {
          allVideos.push(...data.videos);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `YouTube API failed with status ${res.status}`);
      }
    } catch (err) {
      console.error('Failed to fetch for', c.name, err);
      throw err;
    }
  }

  if (allVideos.length === 0) {
    throw new Error(`No videos found for the "${since}" timeframe. The channels may not have posted recently.`);
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
      `[Video ${idx + 1}] ID: ${v.videoId} | Channel: ${v.author} | Title: ${v.title} | Published: ${v.publishedAt}\nDescription: ${v.description.substring(0, 350)}...`
    ).join("\n\n");

    const userPrompt = `Here are the latest videos fetched from the selected channels:\n\n${videoContext}\n\nAnalyze them and generate the video digest JSON array now.`;

    const res = await fetch("/api/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
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
        processedVideos.push(...parsed);
        for (const v of parsed) {
          onVideo(v);
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
  const [channels, setChannels] = useState(INITIAL_CHANNELS);
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

  // Load persisted channels and results from Supabase on mount
  useEffect(() => {
    async function loadFromSupabase() {
      const [chRes, resRes] = await Promise.all([
        sbFetch('channels'),
        sbFetch('results'),
      ]);
      if (chRes?.channels?.length > 0) setChannels(chRes.channels);
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

  const removeChannel = (id) => setChannels(c => c.filter(ch => ch.id !== id));

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

  const allTags = ["All", ...new Set(videos.flatMap(v => v.tags || []))].filter(Boolean);
  const allChannels = ["All", ...new Set(videos.map(v => v.channel))].filter(Boolean);

  let filtered = tagFilter === "All" ? videos : videos.filter(v => v.tags?.includes(tagFilter));
  
  if (channelFilter !== "All") {
    filtered = filtered.filter(v => v.channel === channelFilter);
  }

  filtered.sort((a, b) => {
    if (sortBy.includes("Date")) {
      const d1 = new Date(a.publishedAt || 0).getTime();
      const d2 = new Date(b.publishedAt || 0).getTime();
      return sortBy === "Date (Newest)" ? d2 - d1 : d1 - d2;
    }
    if (sortBy === "Author (A-Z)") return a.channel.localeCompare(b.channel);
    if (sortBy === "Author (Z-A)") return b.channel.localeCompare(a.channel);
    return 0;
  });

  return (
    <>
      <style>{STYLES}</style>
      <div className="root">
        <div className="header">
          <h1>YouTube Digest Agent</h1>
          <p>Fetches real YouTube videos and dynamically tags them for easy filtering.</p>
        </div>


        <div className="panel">
          <div className="section-label">Channels to Monitor</div>
          {channels.map(ch => (
            <div className="channel-row" key={ch.id}>
              <div className="channel-dot" />
              <span className="channel-name">{ch.name}</span>
              <span className="channel-id">{ch.id}</span>
              <button className="remove-btn" onClick={() => removeChannel(ch.id)}>×</button>
            </div>
          ))}
          <div className="add-row">
            <input placeholder="Channel name" value={newName} onChange={e => setNewName(e.target.value)} />
            <input placeholder="Channel ID (UCxxxxxxx)" value={newId} onChange={e => setNewId(e.target.value)} />
            <button className="btn" onClick={addChannel}>Add</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          <div className="section-label" style={{ margin: 0, whiteSpace: "nowrap" }}>Timeframe</div>
          <select value={since} onChange={e => setSince(e.target.value)}
            style={{ height: 36, padding: "0 10px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 13, color: "var(--color-text-primary)", outline: "none" }}>
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
              <div className="section-label" style={{ margin: "0 0 0 10px", whiteSpace: "nowrap" }}>Channel</div>
              <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
                style={{ height: 36, padding: "0 10px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 13, color: "var(--color-text-primary)", outline: "none", minWidth: 120 }}>
                {allChannels.map(c => <option key={c}>{c}</option>)}
              </select>

              <div className="section-label" style={{ margin: "0 0 0 10px", whiteSpace: "nowrap" }}>Sort By</div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ height: 36, padding: "0 10px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 13, color: "var(--color-text-primary)", outline: "none", minWidth: 120 }}>
                <option>Date (Newest)</option>
                <option>Date (Oldest)</option>
                <option>Author (A-Z)</option>
                <option>Author (Z-A)</option>
              </select>
            </>
          )}

          <div style={{ flex: 1 }} />
          <button
            className="btn primary"
            onClick={handleRun}
            disabled={running || channels.length === 0}
          >
            {running ? "Fetching & Analyzing..." : "Run digest agent ↗"}
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
            <div className="filter-row">
              {allTags.map(tag => (
                <button 
                  key={tag} 
                  className={`filter-chip ${tagFilter === tag ? "active" : ""}`} 
                  onClick={() => setTagFilter(tag)}
                >
                  {tag}
                  {tag !== "All" && <span style={{ marginLeft: 6, opacity: 0.6 }}>({videos.filter(v => v.tags?.includes(tag)).length})</span>}
                </button>
              ))}
            </div>

            <div className="digest-grid">
              {filtered.map(v => (
                <div className="video-card" key={v.id}>
                  <div className="card-top">
                    {v.videoId ? (
                      <img className="thumb" src={`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`} alt={v.title} />
                    ) : (
                      <div className="thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>
                    )}
                    <div className="card-meta">
                      <div className="card-title">{v.title}</div>
                      <div className="card-channel">By {v.channel}</div>
                    </div>
                  </div>
                  <div className="card-badges">
                    {(v.tags || []).map(t => (
                      <span key={t} className="badge cat">{t}</span>
                    ))}
                    {v.publishedAt && (
                        <span className="badge date">{new Date(v.publishedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                  <p className="summary-text">{v.summary}</p>
                  <div className="card-footer">
                    <a
                      className="watch-link"
                      href={`https://www.youtube.com/watch?v=${v.videoId}`}
                      target="_blank" rel="noreferrer"
                    >
                      Watch on YouTube →
                    </a>
                    <span className="key-points">{v.keyPoints} key points</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!running && videos.length === 0 && !status && (
          <div className="empty-state">
            <div className="big-icon">◎</div>
            <p>Add your channels and run the agent to fetch and tag real videos.</p>
          </div>
        )}
      </div>
    </>
  );
}
