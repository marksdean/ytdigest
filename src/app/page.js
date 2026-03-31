"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { PretextLines } from "@/components/PretextLines";
import { PT, PT_LH } from "@/lib/pretextFonts";

/** URLs from video description (full text from videos.list — search snippets are truncated). */
function extractLinksFromText(text) {
  if (!text || typeof text !== "string") return [];
  const seen = new Set();
  const out = [];

  const pushNormalized = (raw) => {
    let url = raw.replace(/[.,;:)]+$/, "").replace(/\]+$/,"");
    if (url.startsWith("www.")) url = `https://${url}`;
    try {
      const u = new URL(url);
      if (seen.has(u.href)) return;
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
  };

  const md = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
  let mm;
  while ((mm = md.exec(text)) !== null) {
    pushNormalized(mm[2]);
  }

  const re = /(https?:\/\/[^\s<>\[\]()]+|www\.[^\s<>\[\]()]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    pushNormalized(m[0]);
  }

  return out;
}

/**
 * Supabase/Postgres may return `tags` as a JSON array, a stringified JSON array, or (if mis-typed) a plain string.
 * Never use String.prototype.includes on raw `tags` — it does substring matching on the whole blob and breaks filters
 * (e.g. "Jazz Piano" matches "Advanced Jazz Piano" and unrelated rows).
 */
function normalizeTags(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
  }
  if (typeof raw === "object") {
    return [
      ...new Set(
        Object.values(raw)
          .map((t) => String(t).trim())
          .filter(Boolean)
      ),
    ];
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    // PostgreSQL text[] literal from some drivers, e.g. {Jazz Piano,chords} or {"a","b"}
    if (s.startsWith("{") && s.endsWith("}")) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      const parts = [];
      let i = 0;
      while (i < inner.length) {
        while (i < inner.length && inner[i] === ",") i++;
        if (i >= inner.length) break;
        if (inner[i] === '"') {
          i++;
          let buf = "";
          while (i < inner.length && inner[i] !== '"') {
            if (inner[i] === "\\") i++;
            buf += inner[i] ?? "";
            i++;
          }
          if (inner[i] === '"') i++;
          parts.push(buf.trim());
        } else {
          const j = inner.indexOf(",", i);
          const piece = (j === -1 ? inner.slice(i) : inner.slice(i, j)).trim();
          if (piece) parts.push(piece);
          i = j === -1 ? inner.length : j + 1;
        }
      }
      return [...new Set(parts.map((t) => String(t).trim()).filter(Boolean))];
    }
    if (s.startsWith("[")) {
      try {
        const p = JSON.parse(s);
        if (Array.isArray(p)) {
          return [...new Set(p.map((x) => String(x).trim()).filter(Boolean))];
        }
      } catch {
        /* fall through */
      }
    }
    return [
      ...new Set(
        s
          .split(/[,\n]/)
          .map((t) => t.trim())
          .filter(Boolean)
      ),
    ];
  }
  return [];
}

function videoHasTag(video, tag) {
  const t = String(tag).trim();
  if (!t) return false;
  return normalizeTags(video.tags).some((x) => x === t);
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

  .channel-table-wrap {
    width: 100%;
    overflow-x: auto;
  }
  .channel-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    table-layout: auto;
  }
  .channel-table thead th {
    vertical-align: bottom;
    padding: 0 0 10px 0;
    font-weight: 400;
  }
  .ch-th-cb {
    width: 1%;
    text-align: center;
    vertical-align: bottom;
    padding-left: 6px;
    padding-right: 6px;
  }
  .ch-th-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    max-width: 104px;
    margin: 0 auto;
  }
  .ch-th-title {
    display: block;
    font-family: var(--r-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--r-text);
    text-align: center;
    line-height: 1.2;
  }
  .ch-th-hint {
    display: block;
    font-size: 9px;
    color: var(--r-text-muted);
    line-height: 1.35;
    text-align: center;
  }
  .ch-th-bulk {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 8px;
    width: 100%;
  }
  .ch-th-channel,
  .ch-th-id {
    text-align: left;
    vertical-align: bottom;
    padding-right: 12px;
  }
  .ch-th-remove {
    width: 1%;
    padding: 0;
  }
  .channel-table tbody td {
    padding: 10px 12px 10px 0;
    border-top: 1px solid var(--r-line);
    vertical-align: middle;
  }
  .channel-table tbody tr:first-child td {
    border-top: none;
  }
  .ch-td-cb {
    text-align: center;
    width: 1%;
    white-space: nowrap;
    vertical-align: middle;
    padding-left: 6px;
    padding-right: 6px;
  }

  .btn-text {
    background: none;
    border: none;
    padding: 4px 8px;
    font-size: 10px;
    font-family: var(--r-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--r-text-muted);
    cursor: pointer;
  }
  .btn-text:hover:not(.is-on) { color: var(--r-text); }
  .btn-text.is-on {
    background: var(--r-text);
    color: var(--r-surface);
    border-radius: var(--r-radius);
  }
  .ch-cb {
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--r-text);
  }
  .channel-name { font-weight: 500; color: var(--r-text); text-align: left; }
  .channel-id { font-family: var(--r-mono); font-size: 10px; color: var(--r-text-faint); text-align: left; word-break: break-all; }
  .ch-td-remove { width: 1%; white-space: nowrap; text-align: right; vertical-align: middle; padding-right: 0 !important; padding-left: 8px !important; }
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

  .r-opt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-family: var(--r-mono);
    letter-spacing: 0.02em;
    color: var(--r-text-muted);
    cursor: pointer;
    user-select: none;
    max-width: 220px;
  }
  .r-opt input {
    width: 14px;
    height: 14px;
    margin: 0;
    flex-shrink: 0;
    accent-color: var(--r-text);
    cursor: pointer;
  }

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
  .status-bar .status-msg { flex: 1; min-width: 0; }
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
  .video-card--grid .card-title { font-size: 13px; }
  .video-card--grid .summary-text { font-size: 11px; }

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

function abortIfNeeded(signal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

async function runAgent({
  channels,
  since,
  onStatus,
  onVideo,
  signal,
  existingVideoIds = [],
  forceRefresh = false,
}) {
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
        : `Fetching videos from ${channels.length} channel(s) in parallel…`,
    "running"
  );

  // POST avoids huge query strings when many video IDs are excluded.
  const results = await Promise.allSettled(
    channels.map((c) =>
      fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          channelId: c.id,
          since,
          excludeVideoIds: excludePayload.excludeVideoIds,
          forceRefresh: excludePayload.forceRefresh,
        }),
      }).then((res) => {
        if (!res.ok) return res.json().then((e) => { throw new Error(e.error || `HTTP ${res.status}`); });
        return res.json();
      })
    )
  );

  abortIfNeeded(signal);

  let allVideos = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value?.videos) {
      allVideos.push(...r.value.videos);
    } else if (r.status === "rejected") {
      const msg = r.reason?.name === "AbortError" ? "cancelled" : r.reason?.message;
      errors.push(`${channels[i].name}: ${msg}`);
    }
  });

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (allVideos.length === 0) {
    const detail = errors.length ? ` Errors: ${errors.join("; ")}` : "";
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
    abortIfNeeded(signal);
    const chunk = allVideos.slice(i, i + chunkSize);
    onStatus(`Agent analyzing batch ${Math.ceil(i/chunkSize)+1}/${Math.ceil(allVideos.length/chunkSize)}...`, "running");

    const videoContext = chunk.map((v, idx) =>
      `[Video ${idx + 1}] ID: ${v.videoId} | Channel: ${v.author} | Title: ${v.title} | Published: ${v.publishedAt}\nDescription: ${(v.description || "").slice(0, 350)}...`
    ).join("\n\n");

    const userPrompt = `Here are the latest videos fetched from the selected channels:\n\n${videoContext}\n\nAnalyze them and generate the video digest JSON array now.`;

    const res = await fetch("/api/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
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
  const [sortBy, setSortBy] = useState("Date (Newest)");
  const [viewMode, setViewMode] = useState("list");
  const [tagQuery, setTagQuery] = useState("");
  const [openDesc, setOpenDesc] = useState({});
  const [openLinks, setOpenLinks] = useState({});
  const [digestChannelIds, setDigestChannelIds] = useState(() => new Set());
  const [visibleChannelIds, setVisibleChannelIds] = useState(() => new Set());
  const [descriptionByVideoId, setDescriptionByVideoId] = useState({});
  const [loadingDescId, setLoadingDescId] = useState(null);
  const prevChannelIdsRef = useRef(new Set());
  const digestAbortRef = useRef(null);
  /** Re-run YouTube search + videos.list for every item (higher quota; ignores skip list). */
  const [forceYoutubeRefresh, setForceYoutubeRefresh] = useState(false);

  useEffect(() => {
    const ids = new Set(channels.map((c) => c.id));
    const prev = prevChannelIdsRef.current;

    const sameIds =
      prev.size === ids.size && [...prev].every((id) => ids.has(id));
    if (sameIds) {
      prevChannelIdsRef.current = ids;
      return;
    }

    const mergeSel = (sel) => {
      const next = new Set();
      for (const id of sel) {
        if (ids.has(id)) next.add(id);
      }
      for (const id of ids) {
        if (!prev.has(id)) next.add(id);
      }
      return next;
    };
    setDigestChannelIds(mergeSel);
    setVisibleChannelIds(mergeSel);
    prevChannelIdsRef.current = ids;
  }, [channels]);

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
          tags: normalizeTags(r.tags),
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

  const toggleDigestChannel = (id) => {
    setDigestChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDigest = () => {
    setDigestChannelIds(new Set(channels.map((c) => c.id)));
  };

  const clearDigestSelection = () => {
    setDigestChannelIds(new Set());
  };

  const toggleVisibleChannel = (id) => {
    setVisibleChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setVisibleChannelIds(new Set(channels.map((c) => c.id)));
  };

  const clearVisibleSelection = () => {
    setVisibleChannelIds(new Set());
  };

  const fetchDescriptionIfNeeded = async (v) => {
    const cached = (v.description || descriptionByVideoId[v.videoId] || "").trim();
    if (cached || !v.videoId) return;
    setLoadingDescId(v.id);
    try {
      const res = await fetch(`/api/youtube?videoId=${encodeURIComponent(v.videoId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load description");
      const d = data.description ?? "";
      if (d) {
        setDescriptionByVideoId((prev) => ({ ...prev, [v.videoId]: d }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDescId(null);
    }
  };

  const deleteResult = async (videoId, channel) => {
    setVideos(prev => prev.filter(v => !(v.videoId === videoId && v.channel === channel)));
    if (dbReady) {
      await fetch(`/api/supabase?resource=results&videoId=${encodeURIComponent(videoId)}&channel=${encodeURIComponent(channel)}`, { method: 'DELETE' });
    }
  };

  const handleRun = async () => {
    const selectedChannels = channels.filter((c) => digestChannelIds.has(c.id));
    if (channels.length === 0) return;
    if (selectedChannels.length === 0) {
      setStatus("Select at least one channel for the digest.");
      setStatusType("error");
      return;
    }
    setRunning(true);
    digestAbortRef.current = new AbortController();
    const { signal } = digestAbortRef.current;

    // Do NOT clear videos — results accumulate (append-only)
    setTagFilter("All");

    const newVideos = [];

    try {
      // Persist updated channel list to Supabase
      if (dbReady) {
        await sbFetch('channels', 'POST', channels.map(c => ({ id: c.id, name: c.name })));
      }

      const selectedNames = new Set(selectedChannels.map((c) => c.name));
      const existingVideoIds = [
        ...new Set(
          videos
            .filter((v) => selectedNames.has(v.channel))
            .map((v) => v.videoId)
            .filter(Boolean)
        ),
      ];

      await runAgent({
        channels: selectedChannels,
        since,
        signal,
        existingVideoIds,
        forceRefresh: forceYoutubeRefresh,
        onStatus: (msg, type) => { setStatus(msg); setStatusType(type); },
        onVideo: (v) => {
          newVideos.push(v);
          setVideos(prev => {
            const exists = prev.find(p => p.videoId === v.videoId && p.channel === v.channel);
            return exists ? prev : [...prev, v];
          });
        },
      });

      setStatusType("success");
    } catch (err) {
      if (err?.name === "AbortError") {
        setStatus("Digest cancelled.");
        setStatusType("success");
      } else {
        setStatus(`Error: ${err.message}`);
        setStatusType("error");
      }
    } finally {
      setRunning(false);
      digestAbortRef.current = null;
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
    }
  };

  const handleCancelDigest = () => {
    digestAbortRef.current?.abort();
  };

  const allTags = useMemo(() => {
    const set = new Set();
    for (const v of videos) {
      for (const t of normalizeTags(v.tags)) {
        set.add(t);
      }
    }
    return ["All", ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [videos]);

  const tagsForBank = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return allTags.filter((t) => t === "All" || t.toLowerCase().includes(q));
  }, [allTags, tagQuery]);

  /** When null, show videos from every channel. When a Set, restrict to those channel names. */
  const visibleChannelNames = useMemo(() => {
    if (channels.length === 0) return null;
    if (visibleChannelIds.size === channels.length) return null;
    return new Set(channels.filter((c) => visibleChannelIds.has(c.id)).map((c) => c.name));
  }, [channels, visibleChannelIds]);

  const digestAllOn =
    channels.length > 0 && digestChannelIds.size === channels.length;
  const digestNoneOn =
    channels.length > 0 && digestChannelIds.size === 0;
  const viewAllOn =
    channels.length > 0 && visibleChannelIds.size === channels.length;
  const viewNoneOn =
    channels.length > 0 && visibleChannelIds.size === 0;

  const filtered = useMemo(() => {
    const tf = tagFilter.trim();
    let list =
      tf === "All" || tf === ""
        ? [...videos]
        : videos.filter((v) => videoHasTag(v, tf));
    if (visibleChannelNames !== null) {
      if (visibleChannelNames.size === 0) {
        list = [];
      } else {
        list = list.filter((v) => visibleChannelNames.has(v.channel));
      }
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
  }, [videos, tagFilter, visibleChannelNames, sortBy]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ytdigest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }, [filtered]);

  const exportMarkdown = useCallback(() => {
    const md = filtered
      .map(
        (v) =>
          `## ${v.title}\n**Channel:** ${v.channel}  \n**Published:** ${new Date(v.publishedAt).toLocaleDateString()}  \n**Tags:** ${normalizeTags(v.tags).join(", ")}  \n**Watch:** https://www.youtube.com/watch?v=${v.videoId}\n\n${v.summary}\n`
      )
      .join("\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ytdigest-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
  }, [filtered]);

  const toggleDesc = async (v) => {
    const willOpen = !openDesc[v.id];
    setOpenDesc((o) => ({ ...o, [v.id]: willOpen }));
    if (willOpen) await fetchDescriptionIfNeeded(v);
  };

  const toggleLinks = async (v) => {
    const willOpen = !openLinks[v.id];
    setOpenLinks((o) => ({ ...o, [v.id]: willOpen }));
    if (willOpen) await fetchDescriptionIfNeeded(v);
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="root">
        <header className="header">
          <p className="r-label" style={{ marginBottom: 10 }}>
            <PretextLines
              as="span"
              text="YouTube digest"
              font={PT.headerEyebrow}
              lineHeightPx={PT_LH.headerEyebrow}
              fixedWidth={160}
              style={{ display: "inline-block" }}
            />
          </p>
          <h1>
            <PretextLines
              as="span"
              text="Digest agent"
              font={PT.headerTitle}
              lineHeightPx={PT_LH.headerTitle}
              style={{ display: "block" }}
            />
          </h1>
          <p>
            <PretextLines
              as="span"
              text="Fetches channel uploads, summarizes them, and tags entries for filtering. Built for clarity and long lists."
              font={PT.headerBody}
              lineHeightPx={PT_LH.headerBody}
              style={{ display: "block" }}
            />
          </p>
        </header>

        <div className="panel">
          <p className="r-label" style={{ marginBottom: 12 }}>
            <PretextLines
              as="span"
              text="Channels"
              font={PT.panelLabel}
              lineHeightPx={PT_LH.panelLabel}
              fixedWidth={120}
              style={{ display: "inline-block" }}
            />
          </p>
          {channels.length > 0 && (
            <div className="channel-table-wrap">
              <table className="channel-table">
                <thead>
                  <tr>
                    <th scope="col" className="ch-th-cb">
                      <div className="ch-th-stack">
                        <span className="ch-th-title">
                          <PretextLines
                            as="span"
                            text="Digest"
                            font={PT.thTitle}
                            lineHeightPx={PT_LH.thTitle}
                            fixedWidth={96}
                            style={{ display: "inline-block" }}
                          />
                        </span>
                        <span className="ch-th-hint">
                          <PretextLines
                            as="span"
                            text="Include in next run"
                            font={PT.thHint}
                            lineHeightPx={PT_LH.thHint}
                            fixedWidth={96}
                            style={{ display: "inline-block" }}
                          />
                        </span>
                        <div className="ch-th-bulk">
                          <button
                            type="button"
                            className={`btn-text ${digestAllOn ? "is-on" : ""}`}
                            onClick={selectAllDigest}
                          >
                            <PretextLines
                              as="span"
                              text="All"
                              font={PT.btnText}
                              lineHeightPx={PT_LH.btnText}
                              fixedWidth={40}
                              style={{ display: "inline-block" }}
                            />
                          </button>
                          <button
                            type="button"
                            className={`btn-text ${digestNoneOn ? "is-on" : ""}`}
                            onClick={clearDigestSelection}
                          >
                            <PretextLines
                              as="span"
                              text="None"
                              font={PT.btnText}
                              lineHeightPx={PT_LH.btnText}
                              fixedWidth={44}
                              style={{ display: "inline-block" }}
                            />
                          </button>
                        </div>
                      </div>
                    </th>
                    <th scope="col" className="ch-th-cb">
                      <div className="ch-th-stack">
                        <span className="ch-th-title">
                          <PretextLines
                            as="span"
                            text="View"
                            font={PT.thTitle}
                            lineHeightPx={PT_LH.thTitle}
                            fixedWidth={96}
                            style={{ display: "inline-block" }}
                          />
                        </span>
                        <span className="ch-th-hint">
                          <PretextLines
                            as="span"
                            text="Show in results"
                            font={PT.thHint}
                            lineHeightPx={PT_LH.thHint}
                            fixedWidth={96}
                            style={{ display: "inline-block" }}
                          />
                        </span>
                        <div className="ch-th-bulk">
                          <button
                            type="button"
                            className={`btn-text ${viewAllOn ? "is-on" : ""}`}
                            onClick={selectAllVisible}
                          >
                            <PretextLines
                              as="span"
                              text="All"
                              font={PT.btnText}
                              lineHeightPx={PT_LH.btnText}
                              fixedWidth={40}
                              style={{ display: "inline-block" }}
                            />
                          </button>
                          <button
                            type="button"
                            className={`btn-text ${viewNoneOn ? "is-on" : ""}`}
                            onClick={clearVisibleSelection}
                          >
                            <PretextLines
                              as="span"
                              text="None"
                              font={PT.btnText}
                              lineHeightPx={PT_LH.btnText}
                              fixedWidth={44}
                              style={{ display: "inline-block" }}
                            />
                          </button>
                        </div>
                      </div>
                    </th>
                    <th scope="col" className="ch-th-channel r-label">
                      <PretextLines
                        as="span"
                        text="Channel"
                        font={PT.toolbarLabel}
                        lineHeightPx={PT_LH.toolbarLabel}
                        fixedWidth={80}
                        style={{ display: "inline-block" }}
                      />
                    </th>
                    <th scope="col" className="ch-th-id r-label">
                      <PretextLines
                        as="span"
                        text="ID"
                        font={PT.toolbarLabel}
                        lineHeightPx={PT_LH.toolbarLabel}
                        fixedWidth={32}
                        style={{ display: "inline-block" }}
                      />
                    </th>
                    <th scope="col" aria-label="Remove" className="ch-th-remove" />
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => (
                    <tr key={ch.id}>
                      <td className="ch-td-cb">
                        <input
                          type="checkbox"
                          className="ch-cb"
                          checked={digestChannelIds.has(ch.id)}
                          onChange={() => toggleDigestChannel(ch.id)}
                          aria-label={`Include ${ch.name} in next digest`}
                        />
                      </td>
                      <td className="ch-td-cb">
                        <input
                          type="checkbox"
                          className="ch-cb"
                          checked={visibleChannelIds.has(ch.id)}
                          onChange={() => toggleVisibleChannel(ch.id)}
                          aria-label={`Show results for ${ch.name}`}
                        />
                      </td>
                      <td className="channel-name">
                        <PretextLines text={ch.name} font={PT.tableCell} lineHeightPx={PT_LH.tableCell} />
                      </td>
                      <td className="channel-id">
                        <PretextLines text={ch.id} font={PT.tableMono} lineHeightPx={PT_LH.tableMono} />
                      </td>
                      <td className="ch-td-remove">
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={() => removeChannel(ch.id)}
                          aria-label="Remove channel"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="add-row">
            <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input placeholder="Channel ID (UC…)" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <button type="button" className="btn" onClick={addChannel}>
              <PretextLines
                as="span"
                text="Add"
                font={PT.tableCell}
                lineHeightPx={PT_LH.tableCell}
                fixedWidth={48}
                style={{ display: "inline-block" }}
              />
            </button>
          </div>
        </div>

        <div className="toolbar">
          <span className="r-label">
            <PretextLines
              as="span"
              text="Timeframe"
              font={PT.toolbarLabel}
              lineHeightPx={PT_LH.toolbarLabel}
              fixedWidth={96}
              style={{ display: "inline-block" }}
            />
          </span>
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
              <span className="r-label">
                <PretextLines
                  as="span"
                  text="Sort"
                  font={PT.toolbarLabel}
                  lineHeightPx={PT_LH.toolbarLabel}
                  fixedWidth={48}
                  style={{ display: "inline-block" }}
                />
              </span>
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
              <span className="r-label">
                <PretextLines
                  as="span"
                  text="Layout"
                  font={PT.toolbarLabel}
                  lineHeightPx={PT_LH.toolbarLabel}
                  fixedWidth={56}
                  style={{ display: "inline-block" }}
                />
              </span>
              <div className="seg" role="group" aria-label="Result layout">
                <button
                  type="button"
                  className={viewMode === "list" ? "is-on" : ""}
                  onClick={() => setViewMode("list")}
                >
                  <PretextLines
                    as="span"
                    text="List"
                    font={PT.btnText}
                    lineHeightPx={PT_LH.btnText}
                    fixedWidth={40}
                    style={{ display: "inline-block" }}
                  />
                </button>
                <button
                  type="button"
                  className={viewMode === "grid" ? "is-on" : ""}
                  onClick={() => setViewMode("grid")}
                >
                  <PretextLines
                    as="span"
                    text="Grid"
                    font={PT.btnText}
                    lineHeightPx={PT_LH.btnText}
                    fixedWidth={44}
                    style={{ display: "inline-block" }}
                  />
                </button>
              </div>
              <button type="button" className="btn" onClick={exportJSON}>
                <PretextLines
                  as="span"
                  text="Export JSON"
                  font={PT.tableCell}
                  lineHeightPx={PT_LH.tableCell}
                  fixedWidth={120}
                  style={{ display: "inline-block" }}
                />
              </button>
              <button type="button" className="btn" onClick={exportMarkdown}>
                <PretextLines
                  as="span"
                  text="Export MD"
                  font={PT.tableCell}
                  lineHeightPx={PT_LH.tableCell}
                  fixedWidth={100}
                  style={{ display: "inline-block" }}
                />
              </button>
            </>
          )}

          <label
            className="r-opt"
            title="Off: skip YouTube enrichment for videos already in this digest (lower quota). On: fetch and enrich every video again."
          >
            <input
              type="checkbox"
              checked={forceYoutubeRefresh}
              onChange={(e) => setForceYoutubeRefresh(e.target.checked)}
              disabled={running}
            />
            <PretextLines
              as="span"
              text="Full YouTube re-fetch"
              font={PT.optLabel}
              lineHeightPx={PT_LH.optLabel}
              fixedWidth={220}
              style={{ display: "inline-block", verticalAlign: "middle" }}
            />
          </label>

          <button
            type="button"
            className="btn primary"
            onClick={handleRun}
            disabled={running || channels.length === 0 || digestChannelIds.size === 0}
          >
            <PretextLines
              as="span"
              text={running ? "Running…" : "Run digest"}
              font={PT.runBtn}
              lineHeightPx={PT_LH.runBtn}
              fixedWidth={140}
              style={{ display: "inline-block" }}
            />
          </button>
        </div>

        {status && (
          <div className={`status-bar ${statusType}`}>
            {statusType === "running" && <div className="spinner" />}
            <span className="status-msg">
              <PretextLines text={status || ""} font={PT.status} lineHeightPx={PT_LH.status} />
            </span>
            {running && (
              <button type="button" className="btn" onClick={handleCancelDigest}>
                <PretextLines
                  as="span"
                  text="Cancel"
                  font={PT.tableCell}
                  lineHeightPx={PT_LH.tableCell}
                  fixedWidth={64}
                  style={{ display: "inline-block" }}
                />
              </button>
            )}
          </div>
        )}

        {videos.length > 0 && (
          <>
            <div className="tag-panel">
              <div className="tag-panel-top">
                <span className="r-label">
                  <PretextLines
                    as="span"
                    text="Tags"
                    font={PT.toolbarLabel}
                    lineHeightPx={PT_LH.toolbarLabel}
                    fixedWidth={48}
                    style={{ display: "inline-block" }}
                  />
                </span>
                <input
                  className="tag-search"
                  type="search"
                  placeholder="Search tags…"
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  aria-label="Filter tag list"
                />
                <span className="r-label" style={{ marginLeft: "auto" }}>
                  <PretextLines
                    as="span"
                    text={`${filtered.length} shown`}
                    font={PT.shownCount}
                    lineHeightPx={PT_LH.shownCount}
                    fixedWidth={120}
                    style={{ display: "inline-block" }}
                  />
                </span>
              </div>
              <div className="tag-bank">
                {tagsForBank.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`filter-chip ${tagFilter.trim() === tag.trim() ? "active" : ""}`}
                    onClick={() => setTagFilter(tag.trim())}
                  >
                    <PretextLines
                      as="span"
                      text={
                        tag !== "All"
                          ? `${tag} (${videos.filter((v) => videoHasTag(v, tag.trim())).length})`
                          : tag
                      }
                      font={PT.filterChip}
                      lineHeightPx={PT_LH.filterChip}
                      fixedWidth={280}
                      style={{ display: "inline-block", textAlign: "left" }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className={`digest-scroll ${viewMode === "grid" ? "digest-grid-view" : "digest-list"}`}>
              {filtered.map((v) => {
                const mergedDesc = (
                  v.description ||
                  descriptionByVideoId[v.videoId] ||
                  ""
                ).trim();
                const linkSourceText = [mergedDesc, v.summary || ""].filter(Boolean).join("\n");
                const extraLinks = extractLinksFromText(linkSourceText).filter(
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
                          <PretextLines
                            as="span"
                            text="—"
                            font={PT.tableCell}
                            lineHeightPx={PT_LH.tableCell}
                            fixedWidth={24}
                            style={{ display: "inline-block" }}
                          />
                        </div>
                      )}
                      <div className="card-meta">
                        <div className="card-title">
                          <PretextLines
                            as="span"
                            text={v.title}
                            font={isGrid ? PT.cardTitleGrid : PT.cardTitleList}
                            lineHeightPx={
                              isGrid ? PT_LH.cardTitleGrid : PT_LH.cardTitleList
                            }
                            maxLines={isGrid ? 3 : undefined}
                            style={{ display: "block" }}
                          />
                        </div>
                        <div className="card-channel">
                          <PretextLines
                            as="span"
                            text={v.channel}
                            font={PT.cardChannel}
                            lineHeightPx={PT_LH.cardChannel}
                            maxLines={2}
                            style={{ display: "block" }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="card-tags-scroll" aria-label="Tags">
                      {normalizeTags(v.tags).map((t) => (
                        <span key={t} className="badge">
                          <PretextLines
                            as="span"
                            text={t}
                            font={PT.badge}
                            lineHeightPx={PT_LH.badge}
                            fixedWidth={240}
                            style={{ display: "inline-block" }}
                          />
                        </span>
                      ))}
                      {v.publishedAt && (
                        <span className="badge date">
                          <PretextLines
                            as="span"
                            text={new Date(v.publishedAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                            font={PT.badgeDate}
                            lineHeightPx={PT_LH.badgeDate}
                            fixedWidth={120}
                            style={{ display: "inline-block" }}
                          />
                        </span>
                      )}
                    </div>
                    <p className="summary-text">
                      <PretextLines
                        as="span"
                        text={v.summary || ""}
                        font={isGrid ? PT.summaryGrid : PT.summaryList}
                        lineHeightPx={
                          isGrid ? PT_LH.summaryGrid : PT_LH.summaryList
                        }
                        maxLines={isGrid ? 4 : undefined}
                        style={{ display: "block" }}
                      />
                    </p>

                    {v.videoId && (
                      <div className="r-expand">
                        <button type="button" className="r-expand-btn" onClick={() => toggleDesc(v)}>
                          <span className={`r-chevron ${openDesc[v.id] ? "open" : ""}`}>›</span>
                          <PretextLines
                            as="span"
                            text="Original description"
                            font={PT.expandBtn}
                            lineHeightPx={PT_LH.expandBtn}
                            fixedWidth={200}
                            style={{ display: "inline-block" }}
                          />
                        </button>
                        {openDesc[v.id] && loadingDescId === v.id && !mergedDesc && (
                          <div className="r-expand-body">
                            <PretextLines
                              text="Loading…"
                              font={PT.expandBody}
                              lineHeightPx={PT_LH.expandBody}
                            />
                          </div>
                        )}
                        {openDesc[v.id] && mergedDesc && (
                          <div className="r-expand-body">
                            <PretextLines
                              text={mergedDesc}
                              font={PT.expandBody}
                              lineHeightPx={PT_LH.expandBody}
                              whiteSpace="pre-wrap"
                            />
                          </div>
                        )}
                        {openDesc[v.id] && !mergedDesc && loadingDescId !== v.id && (
                          <div className="r-expand-body" style={{ color: "var(--r-text-faint)" }}>
                            <PretextLines
                              text="No description available."
                              font={PT.expandBody}
                              lineHeightPx={PT_LH.expandBody}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {v.videoId && (
                      <div className="r-expand">
                        <button type="button" className="r-expand-btn" onClick={() => toggleLinks(v)}>
                          <span className={`r-chevron ${openLinks[v.id] ? "open" : ""}`}>›</span>
                          <PretextLines
                            as="span"
                            text={`Links & downloads (${extraLinks.length})`}
                            font={PT.expandBtn}
                            lineHeightPx={PT_LH.expandBtn}
                            fixedWidth={260}
                            style={{ display: "inline-block" }}
                          />
                        </button>
                        {openLinks[v.id] && (
                          <div className="r-expand-body">
                            {extraLinks.length === 0 ? (
                              <p style={{ color: "var(--r-text-faint)", fontSize: 12 }}>
                                <PretextLines
                                  as="span"
                                  text={
                                    mergedDesc
                                      ? "No URLs found in the video description."
                                      : loadingDescId === v.id
                                        ? "Loading description…"
                                        : "Open to load the full description from YouTube, then links appear here."
                                  }
                                  font={PT.expandBody}
                                  lineHeightPx={PT_LH.expandBody}
                                  fixedWidth={400}
                                  style={{ display: "inline-block" }}
                                />
                              </p>
                            ) : (
                              <ul className="link-list">
                                {extraLinks.map((l) => (
                                  <li key={l.url}>
                                    <div className="link-kind">
                                      <PretextLines
                                        as="span"
                                        text={l.kind}
                                        font={PT.linkKind}
                                        lineHeightPx={PT_LH.linkKind}
                                        fixedWidth={120}
                                        style={{ display: "inline-block" }}
                                      />
                                    </div>
                                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                                      <PretextLines
                                        as="span"
                                        text={`${l.host}${l.kind === "pdf" ? " · PDF" : ""}`}
                                        font={PT.linkLine}
                                        lineHeightPx={PT_LH.linkLine}
                                        fixedWidth={400}
                                        style={{ display: "inline-block" }}
                                      />
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
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
                        <PretextLines
                          as="span"
                          text="Open on YouTube"
                          font={PT.watchLink}
                          lineHeightPx={PT_LH.watchLink}
                          fixedWidth={200}
                          style={{ display: "inline-block" }}
                        />
                      </a>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="key-points">
                          <PretextLines
                            as="span"
                            text={`${v.keyPoints ?? 0} key points`}
                            font={PT.keyPoints}
                            lineHeightPx={PT_LH.keyPoints}
                            fixedWidth={160}
                            style={{ display: "inline-block" }}
                          />
                        </span>
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
            <div className="big-icon">
              <PretextLines
                as="span"
                text="□"
                font={PT.emptyState}
                lineHeightPx={PT_LH.emptyState}
                fixedWidth={48}
                style={{ display: "inline-block" }}
              />
            </div>
            <p>
              <PretextLines
                as="span"
                text="Add channels and run the digest. Results stay compact in grid view or scroll in list view."
                font={PT.emptyState}
                lineHeightPx={PT_LH.emptyState}
                style={{ display: "block" }}
              />
            </p>
          </div>
        )}
      </div>
    </>
  );
}
