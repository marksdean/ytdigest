"use client";

import { useState, useEffect } from "react";

const CATEGORIES = ["AI & ML", "Web Dev", "DevOps", "Design", "Security", "Data", "Mobile", "Other"];

const MOCK_CHANNELS = [
  { id: "UCVHFbw7woebIMSbnRN3IOlA", name: "Fireship" },
  { id: "UCW5YeuERMmlnqo4oq8vwUpg", name: "George Hotz" },
  { id: "UCBcRF18a7Qf58cCRy5xuWwQ", name: "Andrej Karpathy" },
];

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

  .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .controls select { height: 36px; padding: 0 10px; background: var(--color-background-secondary); border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-md); font-size: 13px; color: var(--color-text-primary); outline: none; cursor: pointer; }

  .api-key-row { display: flex; gap: 8px; margin-bottom: 1.25rem; }
  .api-key-row input { flex: 1; height: 36px; background: var(--color-background-secondary); border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-md); padding: 0 12px; font-family: 'DM Mono', monospace; font-size: 12px; color: var(--color-text-primary); outline: none; }
  .api-key-row input:focus { border-color: var(--color-border-primary); }
  .api-key-row input::placeholder { font-family: var(--font-sans); color: var(--color-text-tertiary); }

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
  .thumb-placeholder { width: 100px; height: 56px; border-radius: 6px; background: var(--color-background-secondary); flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 0.5px solid var(--color-border-tertiary); }

  .card-meta { flex: 1; min-width: 0; }
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

  .yt-icon { width: 18px; height: 18px; }
`;

function generateMockVideos(channels, count = 6) {
  const topics = [
    { title: "Building a Full-Stack App with Next.js 15 & Server Actions", cat: "Web Dev", points: 3 },
    { title: "I trained a model on my own codebase (here's what happened)", cat: "AI & ML", points: 4 },
    { title: "Kubernetes is Dead. Here's What's Replacing It.", cat: "DevOps", points: 3 },
    { title: "Every AI model ranked: Claude 3.5, GPT-4o, Gemini 1.5 Pro", cat: "AI & ML", points: 5 },
    { title: "The CSS trick everyone uses but nobody understands", cat: "Web Dev", points: 3 },
    { title: "RAG vs Fine-tuning: Which one should you actually use?", cat: "AI & ML", points: 4 },
    { title: "How I built a side project that makes $8k/month", cat: "Other", points: 3 },
    { title: "Rust in 2025: Is it finally worth learning?", cat: "Web Dev", points: 3 },
  ];
  const days = ["1 day ago", "2 days ago", "3 days ago", "4 days ago", "5 days ago", "6 days ago"];
  return topics.slice(0, count).map((t, i) => ({
    id: `vid_${i}`,
    videoId: `dQw4w9WgXcQ`,
    title: t.title,
    channel: channels[i % channels.length]?.name || "Unknown",
    publishedAt: days[i % days.length],
    category: t.cat,
    summary: `This video covers ${t.title.toLowerCase().replace("?", "")}. The creator walks through practical examples and explains key tradeoffs. Useful for developers at all levels.`,
    keyPoints: t.points,
    thumbnail: null,
  }));
}

async function runAgent({ channels, apiKey, since, onStatus, onVideo }) {
  onStatus("Initializing agent...", "running");

  const channelList = channels.map(c => `- ${c.name} (ID: ${c.id})`).join("\n");

  const systemPrompt = `You are a YouTube tech digest agent. Your job is to simulate fetching and summarizing recent videos from tech YouTube channels.

Given a list of channels and a time window, generate realistic video summaries as if you had fetched real data. Return a JSON array of video objects.

Each object must have:
- id: string (unique)
- videoId: string (a plausible YouTube video ID, 11 chars)
- title: string (realistic tech video title)
- channel: string (from the provided channel list)
- publishedAt: string (relative time like "2 days ago")
- category: one of: ${CATEGORIES.join(", ")}
- summary: string (2-3 sentence summary of what the video covers)
- keyPoints: number (estimated number of key takeaways, 3-6)

Generate 6 diverse, realistic videos spread across the channels. Make the titles and summaries genuinely useful and specific. Return ONLY valid JSON array, no other text.`;

  const userPrompt = `Channels to monitor:\n${channelList}\n\nTime window: last ${since}\n\nGenerate the video digest JSON array now.`;

  onStatus("Agent calling Claude API...", "running");

  try {
    const res = await fetch("/api/anthropic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";

    onStatus("Parsing agent response...", "running");

    let videos;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      videos = JSON.parse(clean);
    } catch {
      throw new Error("Could not parse agent response as JSON");
    }

    if (!Array.isArray(videos)) throw new Error("Expected array from agent");

    for (const v of videos) {
      onVideo(v);
      await new Promise(r => setTimeout(r, 180));
    }

    onStatus(`Done — ${videos.length} videos summarized`, "success");
  } catch (err) {
    throw err;
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [channels, setChannels] = useState(MOCK_CHANNELS);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [since, setSince] = useState("7 days");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("running");
  const [videos, setVideos] = useState([]);
  const [filter, setFilter] = useState("All");
  const [useMock, setUseMock] = useState(false);

  const addChannel = () => {
    if (!newName.trim() || !newId.trim()) return;
    setChannels(c => [...c, { id: newId.trim(), name: newName.trim() }]);
    setNewName(""); setNewId("");
  };

  const removeChannel = (id) => setChannels(c => c.filter(ch => ch.id !== id));

  const handleRun = async () => {
    if (channels.length === 0) return;
    setRunning(true);
    setVideos([]);
    setFilter("All");

    if (useMock || !apiKey.trim()) {
      setStatus("Running mock agent (no API key)...", "running");
      setStatusType("running");
      await new Promise(r => setTimeout(r, 800));
      const mocks = generateMockVideos(channels);
      for (const v of mocks) {
        setVideos(prev => [...prev, v]);
        await new Promise(r => setTimeout(r, 120));
      }
      setStatus(`Done — ${mocks.length} videos summarized (mock mode)`, "success");
      setStatusType("success");
      setRunning(false);
      return;
    }

    try {
      await runAgent({
        channels,
        apiKey,
        since,
        onStatus: (msg, type) => { setStatus(msg); setStatusType(type); },
        onVideo: (v) => setVideos(prev => [...prev, v]),
      });
      setStatusType("success");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setStatusType("error");
    } finally {
      setRunning(false);
    }
  };

  const allCategories = ["All", ...new Set(videos.map(v => v.category))];
  const filtered = filter === "All" ? videos : videos.filter(v => v.category === filter);

  return (
    <>
      <style>{STYLES}</style>
      <div className="root">
        <div className="header">
          <h1>YouTube Digest Agent</h1>
          <p>Monitors your channels, summarizes new videos, and categorizes them automatically.</p>
        </div>

        <div className="panel">
          <div className="section-label">Anthropic API Key</div>
          <div className="api-key-row">
            <input
              type={showKey ? "text" : "password"}
              placeholder="sk-ant-... (leave blank to use mock mode)"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <button className="btn" onClick={() => setShowKey(s => !s)}>{showKey ? "Hide" : "Show"}</button>
          </div>
          {!apiKey && (
            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              No API key? The agent will run in mock mode with simulated data.
            </p>
          )}
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
          <div className="add-row" style={{ marginTop: 14 }}>
            <input placeholder="Channel name" value={newName} onChange={e => setNewName(e.target.value)} style={{ maxWidth: 160 }} />
            <input placeholder="Channel ID (UCxxxxxxx)" value={newId} onChange={e => setNewId(e.target.value)} />
            <button className="btn" onClick={addChannel}>Add</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          <div className="section-label" style={{ margin: 0, whiteSpace: "nowrap" }}>Fetch videos from the last</div>
          <select value={since} onChange={e => setSince(e.target.value)}
            style={{ height: 36, padding: "0 10px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 13, color: "var(--color-text-primary)", outline: "none" }}>
            <option>24 hours</option>
            <option>3 days</option>
            <option>7 days</option>
            <option>2 weeks</option>
            <option>1 month</option>
          </select>
          <div style={{ flex: 1 }} />
          <button
            className="btn primary"
            onClick={handleRun}
            disabled={running || channels.length === 0}
          >
            {running ? "Running agent..." : "Run digest agent ↗"}
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
              {allCategories.map(cat => (
                <button key={cat} className={`filter-chip ${filter === cat ? "active" : ""}`} onClick={() => setFilter(cat)}>
                  {cat}
                  {cat !== "All" && <span style={{ marginLeft: 4, opacity: 0.6 }}>({videos.filter(v => v.category === cat).length})</span>}
                </button>
              ))}
            </div>

            <div className="digest-grid">
              {filtered.map(v => (
                <div className="video-card" key={v.id}>
                  <div className="card-top">
                    <div className="thumb-placeholder">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--color-border-secondary)" strokeWidth="1.5">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    </div>
                    <div className="card-meta">
                      <div className="card-title">{v.title}</div>
                      <div className="card-channel">{v.channel} · {v.publishedAt}</div>
                    </div>
                  </div>
                  <div className="card-badges">
                    <span className="badge cat">{v.category}</span>
                    <span className="badge date">{v.publishedAt}</span>
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
            <p>Add your channels and run the agent to get your digest.</p>
          </div>
        )}
      </div>
    </>
  );
}
