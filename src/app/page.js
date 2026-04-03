"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";

/** Decode `&#39;`, `&amp;`, etc. from API/LLM titles and text. */
function decodeHtmlEntities(raw) {
  if (raw == null) return "";
  const s = String(raw);
  if (typeof document === "undefined") {
    return s
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  const ta = document.createElement("textarea");
  ta.innerHTML = s;
  return ta.value;
}

function youtubeWatchUrl(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : "#";
}

function YoutubeMarkIcon() {
  return (
    <svg viewBox="0 0 24 18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M23.5 2.8c-.3-1.1-1.2-2-2.3-2.3C19.5 0 12 0 12 0S4.5 0 2.8.5C1.7.8.8 1.7.5 2.8 0 4.5 0 9 0 9s0 4.5.5 6.2c.3 1.1 1.2 2 2.3 2.3C4.5 18 12 18 12 18s7.5 0 9.2-.5c1.1-.3 2-1.2 2.3-2.3.5-1.7.5-6.2.5-6.2s0-4.5-.5-6.2zM9.5 12.9V5.1L15.8 9 9.5 12.9z"
      />
    </svg>
  );
}
import { createPortal } from "react-dom";
import { PretextLines } from "@/components/PretextLines";
import { PT, PT_LH } from "@/lib/pretextFonts";

/** Turn bare URLs in description text into clickable links (preserves newlines via parent pre-wrap). */
function linkifyDescription(text) {
  const s = text == null ? "" : String(text);
  if (!s) return null;
  const re = /(https?:\/\/[^\s<>\[\]()]+|www\.[^\s<>\[\]()]+)/gi;
  const out = [];
  let last = 0;
  let m;
  let ki = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const raw = m[0];
    let href = raw.replace(/[.,;:)]+$/, "").replace(/\]+$/, "");
    if (href.startsWith("www.")) href = `https://${href}`;
    out.push(
      <a
        key={`ld-${ki++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {raw}
      </a>
    );
    last = m.index + raw.length;
  }
  if (last < s.length) out.push(s.slice(last));
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

/** Tags from #hashtags in video description (supports phrases like #piano lessons). */
function extractHashtagsFromText(text) {
  if (text == null || typeof text !== "string") return [];
  const out = [];
  const re = /#([^\s#]+(?:\s+[^\s#]+)*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].trim().replace(/\s+/g, " ");
    if (t.length > 0 && t.length <= 120) out.push(t);
  }
  return [...new Set(out)];
}

/** Dedupe by case-insensitive key; preserve first-seen casing. */
function mergeTagArrays(...lists) {
  const seen = new Map();
  for (const list of lists) {
    if (list == null) continue;
    const arr = Array.isArray(list) ? list : [list];
    for (const raw of arr) {
      const s = String(raw).trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (!seen.has(k)) seen.set(k, s);
    }
  }
  return [...seen.values()];
}

function videoHasTag(video, tag) {
  const t = String(tag).trim();
  if (!t) return false;
  return normalizeTags(video.tags).some((x) => x === t);
}

/** Align saved channel names with YouTube `channelTitle` (often has a leading "|"). */
function normalizeChannelLabel(s) {
  return String(s ?? "")
    .replace(/^\|+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** YouTube titles often differ slightly from saved channel names (prefix, suffix, punctuation). */
function looselyMatchChannelNames(storedChannel, tableName) {
  const a = normalizeChannelLabel(storedChannel);
  const b = normalizeChannelLabel(tableName);
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true;
  if (a.startsWith(`${b}|`) || b.startsWith(`${a}|`)) return true;
  return false;
}

function videoMatchesVisibleChannels(v, visibleChannelNames, channels, visibleChannelIds) {
  if (visibleChannelNames === null) return true;
  if (visibleChannelNames.size === 0) return false;
  if (v.channelId && visibleChannelIds.has(v.channelId)) return true;
  const vn = normalizeChannelLabel(v.channel);
  if (visibleChannelNames.has(vn)) return true;
  for (const c of channels) {
    if (!visibleChannelIds.has(c.id)) continue;
    if (looselyMatchChannelNames(v.channel, c.name)) return true;
  }
  return false;
}

/**
 * Stable key for list rows and expand/load UI. AI/DB `id` can collide or be missing across items.
 */
function videoRowKey(v) {
  if (v?.videoId && v.channel != null && String(v.channel).trim() !== "") {
    return `${v.videoId}::${v.channel}`;
  }
  return String(v?.id ?? "");
}

/** When `channels` table is empty but digest rows exist, rebuild channel list from stored channel_id. */
function inferChannelsFromVideos(videoRows) {
  const byId = new Map();
  for (const v of videoRows) {
    const cid = v.channelId;
    if (!cid || typeof cid !== "string") continue;
    if (!byId.has(cid)) {
      byId.set(cid, { id: cid, name: v.channel || cid, thumbnailUrl: null });
    }
  }
  return [...byId.values()];
}

function channelRowForDb(c) {
  return { id: c.id, name: c.name, thumbnail_url: c.thumbnailUrl ?? null };
}

/** Normalize `digest_results.read_at` from API/PostgREST (null, ISO string, or rare bad values). */
function digestReadAtFromDb(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "" || t === "null") return null;
    return t;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  return null;
}

function digestIsUnread(readAt) {
  return digestReadAtFromDb(readAt) == null;
}

/**
 * @returns {{ param: string, isUcId: boolean } | null}
 * `param` is passed to channels.list as id (UC…) or forHandle (handle without @).
 */
function parseChannelLookup(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const urlCh = s.match(/\/channel\/(UC[\w-]{22})/i);
  if (urlCh) return { param: urlCh[1], isUcId: true };
  const urlAt = s.match(/youtube\.com\/@([\w.-]+)/i);
  if (urlAt) return { param: urlAt[1], isUcId: false };
  if (/^UC[\w-]{22}$/.test(s)) return { param: s, isUcId: true };
  if (s.startsWith("@")) return { param: s.slice(1), isUcId: false };
  return { param: s, isUcId: /^UC[\w-]{22}$/.test(s) };
}

/** YouTube sometimes returns protocol-relative URLs; ggpht needs a normal https URL. */
function normalizeChannelThumbUrl(u) {
  if (u == null || typeof u !== "string") return null;
  const t = u.trim();
  if (!t) return null;
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function ChannelAvatar({ url, name }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0) || "?";
  const src = normalizeChannelThumbUrl(url);
  if (!src || failed) {
    return (
      <span className="channel-avatar channel-avatar--placeholder" aria-hidden>
        {initial}
      </span>
    );
  }
  return (
    <img
      className="channel-avatar"
      src={src}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

const STYLES = `
  /* Design intent: Dieter Rams’ ten principles for good design — see
     https://uxdesign.cc/dieter-rams-and-ten-principles-for-good-design-61cc32bcd6e6
     Useful, understandable, unobtrusive, honest, long-lasting, thorough, minimal,
     environmentally considerate (lighter motion, no decorative excess), aesthetic clarity. */

  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

  :root {
    /* Page white; panels/dialog surfaces light gray */
    --r-bg: #ffffff;
    --r-surface: #e8e8e8;
    --r-surface-hot: #f2f2f2;
    --r-line: #AAB7BF;
    --r-line-muted: #9C9C9C;
    --r-line-focus: #261201;
    --r-text: #261201;
    --r-text-muted: #736356;
    --r-text-faint: #9C9C9C;
    --r-taupe: #BFB1A8;
    --r-sand: #C09C6F;
    --r-earth: #5F503E;
    /* Interactive accent / “selected” (buttons, chips, checkboxes) */
    --r-accent: #6b6e73;
    --r-accent-hover: #55585c;
    --r-run: #736b1e;
    --r-run-hover: #5e5818;
    --r-on-run: #ffffff;
    --r-run-arrow: #ffffff;
    --r-cancel: #bf1b1b;
    --r-cancel-hover: #9f1616;
    --r-selected: #6b6e73;
    --r-on-selected: #ffffff;
    --r-accent-warm: #5a5d62;
    --r-on-dark: #E1E4E1;
    --r-on-accent: #F2F1EC;
    --r-radius: 2px;
    --r-font: 'Inter', system-ui, sans-serif;
    --r-mono: 'IBM Plex Mono', ui-monospace, monospace;
    --rDigestH: min(70vh, 900px);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  @media (prefers-reduced-motion: no-preference) {
    html { scroll-behavior: smooth; }
  }

  body {
    font-family: var(--r-font);
    background: var(--r-bg);
    color: var(--r-text);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }

  :focus-visible {
    outline: 2px solid var(--r-line-focus);
    outline-offset: 3px;
  }
  :focus:not(:focus-visible) {
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
    .spinner { animation: none !important; border-top-color: var(--r-text); }
  }

  .root {
    position: relative;
    max-width: min(1680px, 100%);
    margin: 0 auto;
    padding: 2rem clamp(1rem, 3vw, 2rem) 3rem;
  }

  .rams-skip {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .rams-skip:focus {
    position: fixed;
    z-index: 10000;
    left: 12px;
    top: 12px;
    width: auto;
    height: auto;
    margin: 0;
    padding: 10px 14px;
    clip: auto;
    overflow: visible;
    white-space: normal;
    font-size: 12px;
    font-family: var(--r-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--r-on-dark);
    background: var(--r-text);
    border: 1px solid var(--r-line-focus);
    border-radius: var(--r-radius);
  }

  .r-label {
    font-family: var(--r-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--r-text-faint);
  }

  .header { margin-bottom: 1.75rem; border-bottom: 1px solid var(--r-line); padding-bottom: 1.15rem; }
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
  .channel-panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }
  .channel-panel-head .r-label { margin-bottom: 0 !important; }
  .channels-collapsed-hint {
    font-size: 12px;
    color: var(--r-text-muted);
    margin: 0 0 8px 0;
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
    background: var(--r-selected);
    color: var(--r-on-selected);
    border-radius: var(--r-radius);
  }
  .ch-cb {
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--r-accent);
  }
  .channel-name { font-weight: 500; color: var(--r-text); text-align: left; }
  .channel-name-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .channel-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid var(--r-line);
    background: var(--r-bg);
  }
  .channel-avatar--placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--r-font);
    color: var(--r-text-muted);
    background: var(--r-surface-hot);
  }
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
    background: var(--r-surface-hot);
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
    background: var(--r-run);
    color: var(--r-on-run);
    border-color: var(--r-run);
  }
  .btn.primary:hover { background: var(--r-run-hover); border-color: var(--r-run-hover); }
  .btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }

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
    flex: 0 1 auto;
    min-width: 0;
  }
  .r-opt .r-opt-text {
    min-width: 0;
    white-space: normal;
    line-height: 1.25;
    display: flex;
    align-items: center;
  }
  .r-opt input[type="checkbox"] {
    width: 14px;
    height: 14px;
    margin: 0;
    flex-shrink: 0;
    accent-color: var(--r-accent);
    cursor: pointer;
    align-self: center;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    margin-bottom: 1rem;
    padding-bottom: 2px;
    box-sizing: border-box;
    row-gap: 12px;
  }
  .toolbar-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .toolbar-field .r-label {
    display: inline-flex;
    align-items: center;
    line-height: 1;
  }
  .toolbar-r-opt {
    gap: 6px;
    max-width: min(22rem, 100%);
    margin-left: 2px;
  }
  .toolbar > *:not(.toolbar-grow) { flex-shrink: 0; }
  .toolbar-grow { flex: 1 1 12px; min-width: 12px; }

  .btn-play {
    width: 36px;
    height: 36px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .btn-play svg { width: 18px; height: 18px; display: block; }
  .btn-play svg path { fill: var(--r-run-arrow); }
  .btn-play .spinner {
    border-color: rgba(255, 255, 255, 0.35);
    border-top-color: var(--r-on-run);
  }
  .btn-cancel {
    background: var(--r-cancel) !important;
    border-color: var(--r-cancel) !important;
    color: #fff !important;
  }
  .btn-cancel:hover {
    background: var(--r-cancel-hover) !important;
    border-color: var(--r-cancel-hover) !important;
  }

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
    background: var(--r-selected);
    color: var(--r-on-selected);
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
  .status-bar.running { border-color: var(--r-line-muted); }
  .status-bar.error { border-color: var(--r-cancel); }
  .status-bar.success { border-color: var(--r-earth); }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--r-line);
    border-top-color: var(--r-text);
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .rams-results { display: contents; }

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
  .tag-search.title-search {
    flex: 1 1 160px;
    min-width: 140px;
  }
  .tag-star-filter {
    flex: 0 0 auto;
    align-items: center;
    align-self: center;
    max-width: 160px;
  }
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
    background: var(--r-selected);
    color: var(--r-on-selected);
    border-color: var(--r-selected);
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
    height: 100%;
    border-bottom: none;
  }
  .video-card--grid .card-main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .video-card--grid .card-top {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 8px;
    gap: 10px;
  }
  .video-card--grid .thumb-link {
    width: 100%;
    min-height: 0;
    align-self: stretch;
  }
  .video-card--grid .thumb {
    width: 100%;
    min-height: 0;
    height: auto;
    aspect-ratio: 16/9;
  }
  .video-card--grid .card-title { font-size: 13px; }
  .video-card--grid .summary-text { font-size: 11px; }

  .card-top { display: flex; align-items: stretch; gap: 14px; margin-bottom: 12px; }
  .thumb-link {
    display: flex;
    width: 200px;
    flex-shrink: 0;
    align-self: stretch;
    min-height: 104px;
    border: 1px solid var(--r-line);
    background: var(--r-bg);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
  }
  .thumb-link:focus-visible {
    outline: 2px solid var(--r-line-focus);
    outline-offset: 2px;
  }
  .thumb-link--placeholder {
    pointer-events: none;
    cursor: default;
  }
  .thumb {
    width: 100%;
    height: 100%;
    min-height: 104px;
    object-fit: cover;
    display: block;
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

  .card-tags-popover-wrap {
    position: relative;
    margin-bottom: 10px;
    z-index: 1;
  }
  .video-card--grid .card-tags-popover-wrap.is-open {
    z-index: 30;
  }
  .card-tags-trigger {
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    padding: 6px 10px;
    font-size: 11px;
    font-family: var(--r-mono);
    letter-spacing: 0.04em;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface-hot);
    cursor: pointer;
    color: var(--r-text-muted);
  }
  .card-tags-trigger:hover {
    border-color: var(--r-text-faint);
    color: var(--r-text);
  }
  .card-tags-trigger.is-open {
    border-color: var(--r-line-focus);
    color: var(--r-text);
  }
  .card-tags-popover {
    padding: 10px;
    background: var(--r-bg);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    box-shadow: 0 6px 20px rgba(38, 18, 1, 0.12);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-content: flex-start;
    max-height: min(42vh, 220px);
    overflow-y: auto;
    scrollbar-width: thin;
    box-sizing: border-box;
  }
  .card-tags-popover--floating {
    max-width: min(100vw - 24px, 360px);
  }
  .card-tags-popover-empty {
    font-size: 11px;
    color: var(--r-text-faint);
    font-family: var(--r-mono);
    width: 100%;
  }
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

  .desc-popover-wrap {
    margin-top: 8px;
  }
  .desc-popover-trigger {
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    padding: 6px 10px;
    font-size: 11px;
    font-family: var(--r-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface-hot);
    cursor: pointer;
    color: var(--r-text-muted);
  }
  .desc-popover-trigger:hover {
    border-color: var(--r-text-faint);
    color: var(--r-text);
  }
  .desc-popover-trigger.is-open {
    border-color: var(--r-line-focus);
    color: var(--r-text);
  }
  .desc-popover-floating {
    display: flex;
    flex-direction: column;
    background: var(--r-bg);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    box-shadow: 0 8px 28px rgba(38, 18, 1, 0.16);
    box-sizing: border-box;
    max-width: min(100vw - 24px, 560px);
  }
  .desc-popover-floating-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--r-line);
    flex-shrink: 0;
  }
  .desc-popover-floating-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    color: var(--r-text-faint);
    padding: 2px 6px;
    flex-shrink: 0;
  }
  .desc-popover-floating-close:hover { color: var(--r-text); }
  .desc-popover-floating-inner {
    margin: 0;
    padding: 12px 14px;
    max-height: min(70vh, 480px);
    overflow-y: auto;
  }
  .r-expand-body {
    padding: 0 0 12px;
    font-size: 12px;
    line-height: 1.65;
    color: var(--r-text-muted);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .r-expand-body.desc-linkified a {
    color: var(--r-earth);
    text-decoration: underline;
    text-underline-offset: 3px;
    word-break: break-all;
  }
  .r-expand-body.desc-linkified a:hover { color: var(--r-accent-warm); }

  .card-footer {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--r-line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .video-card--grid .card-footer {
    margin-top: auto;
    flex-shrink: 0;
  }
  .card-footer-start {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }
  .card-footer-delete {
    flex-shrink: 0;
    margin-left: auto;
  }
  .watch-link-yt {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--r-radius);
    border: 1px solid var(--r-line);
    background: var(--r-surface-hot);
    color: var(--r-earth);
    text-decoration: none;
    flex-shrink: 0;
  }
  .watch-link-yt:hover {
    color: var(--r-accent);
    border-color: var(--r-text-faint);
    background: var(--r-bg);
  }
  .watch-link-yt svg {
    width: 22px;
    height: 16px;
    display: block;
  }
  .key-points { font-family: var(--r-mono); font-size: 10px; color: var(--r-text-faint); }

  .card-actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    min-width: 0;
  }
  .card-actions .card-tags-popover-wrap {
    flex: 1;
    min-width: 0;
    margin-bottom: 0;
  }
  .card-actions .card-tags-trigger {
    width: 100%;
    min-width: 0;
  }
  .card-actions .card-tags-scroll {
    flex: 1;
    min-width: 0;
    margin-bottom: 0;
  }
  .star-btn {
    background: var(--r-surface-hot);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    width: 32px;
    height: 32px;
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    color: var(--r-text-faint);
    flex-shrink: 0;
  }
  .star-btn:hover { color: var(--r-text); border-color: var(--r-text-faint); }
  .star-btn.is-starred {
    color: var(--r-selected);
    border-color: var(--r-selected);
    background: var(--r-surface);
  }
  .read-toggle {
    background: var(--r-surface-hot);
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--r-mono);
    letter-spacing: 0.04em;
    color: var(--r-text-faint);
    flex-shrink: 0;
  }
  .read-toggle:hover {
    color: var(--r-text);
    border-color: var(--r-text-faint);
  }
  .read-toggle[aria-pressed="true"] {
    color: var(--r-text-muted);
    border-color: var(--r-line);
  }
  .video-card.is-unread {
    box-shadow: inset 4px 0 0 0 var(--r-sand);
  }
  .card-note-label {
    font-family: var(--r-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--r-text-faint);
    margin-top: 10px;
    margin-bottom: 4px;
  }
  .card-note {
    width: 100%;
    margin-top: 0;
    min-height: 52px;
    padding: 8px 10px;
    font-size: 12px;
    font-family: var(--r-font);
    line-height: 1.45;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface-hot);
    color: var(--r-text);
    resize: vertical;
    outline: none;
  }
  .card-note:focus { border-color: var(--r-line-focus); }
  .purge-bar {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed var(--r-line);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: stretch;
  }
  .purge-bar input {
    flex: 1;
    min-width: 140px;
    max-width: 280px;
    height: 36px;
    min-height: 36px;
    box-sizing: border-box;
    padding: 0 10px;
    font-size: 12px;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface-hot);
    font-family: var(--r-font);
  }
  .purge-bar .btn {
    height: 36px;
    min-height: 36px;
    box-sizing: border-box;
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .filter-empty-hint,
  .load-hint {
    padding: 12px 14px;
    margin-bottom: 1rem;
    border: 1px solid var(--r-line);
    border-radius: var(--r-radius);
    background: var(--r-surface-hot);
    font-size: 13px;
    color: var(--r-text-muted);
    line-height: 1.5;
  }
  .filter-empty-hint { border-color: var(--r-sand); }
  .load-hint { border-color: var(--r-line-muted); }

  .empty-state {
    text-align: center;
    padding: 2.5rem 1rem;
    color: var(--r-text-muted);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .empty-state p {
    font-size: 13px;
    margin: 0;
    line-height: 1.55;
    white-space: nowrap;
    display: inline-block;
    max-width: none;
  }
  .big-icon { display: none; }

  @media print {
    [data-tags-popover-floating],
    [data-desc-popover-floating] { display: none !important; }
    .toolbar, .rams-skip, .add-row, .ch-td-remove, .remove-btn, .desc-popover-trigger, .tag-panel { display: none !important; }
    .root { padding: 0; max-width: none; }
    body { background: #fff; }
  }
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
      const cid = channels[i].id;
      for (const vid of r.value.videos) {
        allVideos.push({ ...vid, channelId: vid.channelId ?? cid });
      }
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
- title: string (must match the input title exactly; use plain Unicode text, never HTML entities like &#39; for apostrophes)
- channel: string (must match the input channel/author exactly)
- publishedAt: string (must match the input published date)
- tags: array of strings. Generate 2 to 4 highly specific fine-grained subject tags based on the topic (e.g. "music theory", "chords", "react", "testing", "ai models"). Do not use broad terms like "General". Hashtags in the video description (e.g. #piano) are merged into tags automatically on the client—you may still output subject tags.
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
          const desc = src?.description ?? "";
          const tagsMerged = mergeTagArrays(
            Array.isArray(v.tags) ? v.tags : [],
            extractHashtagsFromText(desc)
          );
          const enriched = {
            ...v,
            title: decodeHtmlEntities(v.title ?? ""),
            description: desc,
            tags: tagsMerged,
            channelId: src?.channelId ?? null,
            channel: decodeHtmlEntities(
              v.channel || src?.author || v.channel || ""
            ),
            starred: false,
            userNote: "",
            readAt: null,
          };
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
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        loadFailed: true,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return json;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource, data }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json.error || `HTTP ${res.status}` };
  }
  return { ok: true, ...json };
}

export default function App() {
  const [channels, setChannels] = useState([]);
  /** Optional label when adding a channel; if empty, title is fetched from YouTube by ID/handle. */
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [resolvingChannel, setResolvingChannel] = useState(false);
  const [since, setSince] = useState("1 month");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("running");
  const [videos, setVideos] = useState([]);
  const videosRef = useRef([]);
  const [dbReady, setDbReady] = useState(false);
  const dbReadyRef = useRef(false);
  dbReadyRef.current = dbReady;
  
  // Sorting & Filtering
  const [tagFilter, setTagFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Date (Newest)");
  const [viewMode, setViewMode] = useState("grid");
  /** Grid view: open tag popover (fixed layer) anchored to trigger. */
  const [tagsPopover, setTagsPopover] = useState(null);
  const digestScrollRef = useRef(null);
  const [channelsPanelHidden, setChannelsPanelHidden] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const thumbFetchDoneRef = useRef(new Set());

  useEffect(() => {
    const ids = new Set(channels.map((c) => c.id));
    for (const id of [...thumbFetchDoneRef.current]) {
      if (!ids.has(id)) thumbFetchDoneRef.current.delete(id);
    }
  }, [channels]);
  /** Open “original description” popover: position + row key (videoRowKey). */
  const [descPopover, setDescPopover] = useState(null);
  const [digestChannelIds, setDigestChannelIds] = useState(() => new Set());
  const [visibleChannelIds, setVisibleChannelIds] = useState(() => new Set());
  const [descriptionByVideoId, setDescriptionByVideoId] = useState({});
  const [loadingDescId, setLoadingDescId] = useState(null);
  const prevChannelIdsRef = useRef(new Set());
  /** When true, do not auto-fill digest/view checkboxes (user chose None or toggled). */
  const digestSelectionTouchedRef = useRef(false);
  const viewSelectionTouchedRef = useRef(false);
  const digestAbortRef = useRef(null);
  /** Re-run YouTube search + videos.list for every item (higher quota; ignores skip list). */
  const [forceYoutubeRefresh, setForceYoutubeRefresh] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [purgeSecretInput, setPurgeSecretInput] = useState("");
  const [purging, setPurging] = useState(false);
  const noteTimersRef = useRef({});

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    if (tagsPopover == null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setTagsPopover(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tagsPopover]);

  useEffect(() => {
    if (tagsPopover == null) return;
    const onDoc = (e) => {
      const t = e.target;
      if (
        t instanceof Element &&
        !t.closest("[data-tags-popover-root]") &&
        !t.closest("[data-tags-popover-floating]")
      ) {
        setTagsPopover(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [tagsPopover]);

  useEffect(() => {
    if (tagsPopover == null) return;
    const onScroll = () => setTagsPopover(null);
    const el = digestScrollRef.current;
    el?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [tagsPopover]);

  useEffect(() => {
    if (viewMode !== "grid") setTagsPopover(null);
    setDescPopover(null);
  }, [viewMode]);

  /** Backfill channel avatars when URL is missing (inferred channels, failed saves, or protocol-relative URLs). */
  useEffect(() => {
    let cancelled = false;
    const need = channels.filter(
      (c) =>
        c.id &&
        /^UC[\w-]{22}$/.test(c.id) &&
        !c.thumbnailUrl &&
        !thumbFetchDoneRef.current.has(c.id)
    );
    if (need.length === 0) return;
    need.forEach((c) => thumbFetchDoneRef.current.add(c.id));

    (async () => {
      const updates = await Promise.all(
        need.map(async (c) => {
          try {
            const res = await fetch(
              `/api/youtube?channelId=${encodeURIComponent(c.id)}&channelTitleOnly=1`
            );
            const data = await res.json();
            if (!res.ok) return { id: c.id, thumb: null };
            return {
              id: c.id,
              thumb: normalizeChannelThumbUrl(data.thumbnailUrl ?? null),
            };
          } catch {
            return { id: c.id, thumb: null };
          }
        })
      );
      if (cancelled) return;
      setChannels((prev) => {
        const map = new Map(prev.map((x) => [x.id, { ...x }]));
        let changed = false;
        for (const u of updates) {
          if (u.thumb && map.has(u.id)) {
            map.get(u.id).thumbnailUrl = u.thumb;
            changed = true;
          }
        }
        if (!changed) return prev;
        const next = [...map.values()];
        if (dbReadyRef.current) {
          sbFetch("channels", "POST", next.map(channelRowForDb)).catch(() => {});
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [channels]);

  useEffect(() => {
    if (descPopover == null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDescPopover(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [descPopover]);

  useEffect(() => {
    if (descPopover == null) return;
    const onDoc = (e) => {
      const t = e.target;
      if (
        t instanceof Element &&
        !t.closest("[data-desc-popover-root]") &&
        !t.closest("[data-desc-popover-floating]")
      ) {
        setDescPopover(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [descPopover]);

  useEffect(() => {
    if (descPopover == null) return;
    const onScroll = () => setDescPopover(null);
    const el = digestScrollRef.current;
    el?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [descPopover]);

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

  /**
   * Recover from empty digest/view selection when channels exist (race with Supabase load
   * or merge effect). Does not override after the user explicitly uses All/None/toggles.
   */
  useLayoutEffect(() => {
    if (channels.length === 0) return;
    const all = new Set(channels.map((c) => c.id));
    if (!digestSelectionTouchedRef.current && digestChannelIds.size === 0) {
      setDigestChannelIds(all);
    }
    if (!viewSelectionTouchedRef.current && visibleChannelIds.size === 0) {
      setVisibleChannelIds(all);
    }
  }, [channels, digestChannelIds.size, visibleChannelIds.size]);

  // Load persisted channels and results from Supabase on mount
  useEffect(() => {
    async function loadFromSupabase() {
      const [chRes, resRes] = await Promise.all([
        sbFetch('channels'),
        sbFetch('results'),
      ]);

      const mapped = Array.isArray(resRes?.results)
        ? resRes.results.map((r) => ({
            id: r.id,
            videoId: r.video_id,
            title: decodeHtmlEntities(r.title),
            channel: decodeHtmlEntities(r.channel),
            channelId: r.channel_id ?? null,
            publishedAt: r.published_at,
            tags: mergeTagArrays(
              normalizeTags(r.tags),
              extractHashtagsFromText(decodeHtmlEntities(r.description ?? ""))
            ),
            summary: r.summary,
            keyPoints: r.key_points,
            description: r.description ?? "",
            starred: Boolean(r.starred),
            userNote: r.user_note ?? "",
            readAt: digestReadAtFromDb(r.read_at),
          }))
        : null;

      if (mapped) {
        setVideos(mapped);
      }

      const hasSavedChannels =
        Array.isArray(chRes?.channels) && chRes.channels.length > 0;
      if (hasSavedChannels) {
        const list = chRes.channels.map((c) => ({
          id: c.id,
          name: c.name,
          thumbnailUrl: normalizeChannelThumbUrl(c.thumbnail_url ?? null),
        }));
        const ids = new Set(list.map((c) => c.id));
        prevChannelIdsRef.current = ids;
        setChannels(list);
        setDigestChannelIds(ids);
        setVisibleChannelIds(ids);
      } else if (mapped?.length) {
        const inferred = inferChannelsFromVideos(mapped);
        if (inferred.length > 0) {
          const ids = new Set(inferred.map((c) => c.id));
          prevChannelIdsRef.current = ids;
          setChannels(inferred);
          setDigestChannelIds(ids);
          setVisibleChannelIds(ids);
        }
      }

      const loadErrors = [];
      if (chRes?.loadFailed) loadErrors.push(`Channels: ${chRes.error}`);
      if (resRes?.loadFailed) loadErrors.push(`Digest results: ${resRes.error}`);
      if (loadErrors.length > 0) {
        setStatus(loadErrors.join(' · '));
        setStatusType('error');
      }
      setDbReady(loadErrors.length === 0);
    }
    loadFromSupabase().catch((e) => {
      setStatus(`Database load failed: ${e?.message || String(e)}`);
      setStatusType('error');
      setDbReady(false);
    });
  }, []);

  const addChannel = async () => {
    const parsed = parseChannelLookup(newId);
    if (!parsed) return;
    const overrideName = newName.trim();

    if (parsed.isUcId && channels.some((c) => c.id === parsed.param)) {
      setStatus("That channel is already in the list.");
      setStatusType("error");
      return;
    }

    if (parsed.isUcId && overrideName) {
      setResolvingChannel(true);
      setStatus(null);
      try {
        const res = await fetch(
          `/api/youtube?channelId=${encodeURIComponent(parsed.param)}&channelTitleOnly=1`
        );
        const data = await res.json();
        const resolvedId = res.ok ? data.channelId || parsed.param : parsed.param;
        const thumb = normalizeChannelThumbUrl(
          res.ok ? data.thumbnailUrl ?? null : null
        );
        setChannels((ch) => [
          ...ch,
          { id: resolvedId, name: overrideName, thumbnailUrl: thumb },
        ]);
        setNewName("");
        setNewId("");
      } catch {
        setChannels((ch) => [...ch, { id: parsed.param, name: overrideName, thumbnailUrl: null }]);
        setNewName("");
        setNewId("");
      } finally {
        setResolvingChannel(false);
      }
      return;
    }

    setResolvingChannel(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/youtube?channelId=${encodeURIComponent(parsed.param)}&channelTitleOnly=1`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not resolve channel");
      const resolvedId = data.channelId || parsed.param;
      if (channels.some((c) => c.id === resolvedId)) {
        setStatus("That channel is already in the list.");
        setStatusType("error");
        return;
      }
      const name = overrideName || data.channelTitle || resolvedId;
      const thumb = normalizeChannelThumbUrl(data.thumbnailUrl ?? null);
      setChannels((c) => [...c, { id: resolvedId, name, thumbnailUrl: thumb }]);
      setNewName("");
      setNewId("");
    } catch (e) {
      setStatus(
        e?.message ||
          "Could not resolve channel. Use a channel ID (UC…), youtube.com/channel/UC…, or @handle URL."
      );
      setStatusType("error");
    } finally {
      setResolvingChannel(false);
    }
  };

  const removeChannel = async (id) => {
    const removed = channels.find((ch) => ch.id === id);
    const updated = channels.filter((ch) => ch.id !== id);
    setChannels(updated);
    setVideos((prev) =>
      prev.filter((v) => {
        if (v.channelId === id) return false;
        if (removed && looselyMatchChannelNames(v.channel, removed.name)) return false;
        return true;
      })
    );
    if (dbReady) {
      await sbFetch("channels", "POST", updated.map(channelRowForDb));
      if (removed) {
        const qs = new URLSearchParams({
          resource: "results_by_channel",
          channelId: removed.id,
          channel: removed.name,
        });
        await fetch(`/api/supabase?${qs}`, { method: "DELETE" });
      }
    }
  };

  const handlePurgeAll = async () => {
    if (!dbReady) {
      setStatus("Database not connected.");
      setStatusType("error");
      return;
    }
    if (
      !window.confirm(
        "Delete all channels and digest results from the database? This cannot be undone."
      )
    ) {
      return;
    }
    setPurging(true);
    setStatus("Clearing database…");
    setStatusType("running");
    try {
      const data = purgeSecretInput.trim()
        ? { secret: purgeSecretInput.trim() }
        : { confirmToken: "DELETE_ALL_DIGEST_DATA" };
      const res = await fetch("/api/supabase?resource=purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "purge", data }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      setChannels([]);
      setVideos([]);
      digestSelectionTouchedRef.current = false;
      viewSelectionTouchedRef.current = false;
      setPurgeSecretInput("");
      setTagFilter("All");
      setStarredOnly(false);
      setStatus("All data cleared.");
      setStatusType("success");
    } catch (e) {
      setStatus(`Could not clear database: ${e.message}`);
      setStatusType("error");
    } finally {
      setPurging(false);
    }
  };

  const persistResultMeta = async (v, patch) => {
    if (!dbReady) return;
    const payload = {
      video_id: v.videoId,
      channel: v.channel,
      ...patch,
    };
    if (v.channelId) payload.channel_id = v.channelId;
    await fetch("/api/supabase?resource=result_meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "result_meta", data: payload }),
    });
  };

  const toggleStar = async (v) => {
    const next = !v.starred;
    setVideos((prev) =>
      prev.map((p) =>
        p.videoId === v.videoId && p.channel === v.channel ? { ...p, starred: next } : p
      )
    );
    await persistResultMeta(v, { starred: next });
  };

  const toggleRead = async (v) => {
    const nextReadAt = digestIsUnread(v.readAt)
      ? new Date().toISOString()
      : null;
    setVideos((prev) =>
      prev.map((p) =>
        p.videoId === v.videoId && p.channel === v.channel ? { ...p, readAt: nextReadAt } : p
      )
    );
    await persistResultMeta(v, { read_at: nextReadAt });
  };

  const scheduleNoteSave = (v, text) => {
    const k = videoRowKey(v);
    if (noteTimersRef.current[k]) clearTimeout(noteTimersRef.current[k]);
    noteTimersRef.current[k] = setTimeout(() => {
      void persistResultMeta({ ...v, userNote: text }, { user_note: text });
    }, 600);
  };

  const onNoteChange = (v, text) => {
    setVideos((prev) =>
      prev.map((p) =>
        p.videoId === v.videoId && p.channel === v.channel ? { ...p, userNote: text } : p
      )
    );
    scheduleNoteSave({ ...v, userNote: text }, text);
  };

  const toggleDigestChannel = (id) => {
    digestSelectionTouchedRef.current = true;
    setDigestChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDigest = () => {
    digestSelectionTouchedRef.current = true;
    setDigestChannelIds(new Set(channels.map((c) => c.id)));
  };

  const clearDigestSelection = () => {
    digestSelectionTouchedRef.current = true;
    setDigestChannelIds(new Set());
  };

  const toggleVisibleChannel = (id) => {
    viewSelectionTouchedRef.current = true;
    setVisibleChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    viewSelectionTouchedRef.current = true;
    setVisibleChannelIds(new Set(channels.map((c) => c.id)));
  };

  const clearVisibleSelection = () => {
    viewSelectionTouchedRef.current = true;
    setVisibleChannelIds(new Set());
  };

  const fetchDescriptionIfNeeded = async (v) => {
    const cached = (v.description || descriptionByVideoId[v.videoId] || "").trim();
    if (cached || !v.videoId) return;
    setLoadingDescId(videoRowKey(v));
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
        const chSave = await sbFetch(
          "channels",
          "POST",
          channels.map(channelRowForDb)
        );
        if (chSave?.ok === false) {
          setStatus(`Could not save channel list: ${chSave.error}`);
          setStatusType("error");
        }
      }

      const selectedIds = new Set(selectedChannels.map((c) => c.id));
      const selectedNames = new Set(selectedChannels.map((c) => c.name));
      const existingVideoIds = [
        ...new Set(
          videos
            .filter((v) => {
              if (v.channelId && selectedIds.has(v.channelId)) return true;
              return selectedNames.has(v.channel);
            })
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
          setVideos((prev) => {
            const exists = prev.find(
              (p) => p.videoId === v.videoId && p.channel === v.channel
            );
            const next = exists ? prev : [...prev, v];
            videosRef.current = next;
            return next;
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
        const rows = newVideos.map((v) => {
          const existing = videosRef.current.find(
            (p) => p.videoId === v.videoId && p.channel === v.channel
          );
          return {
            id: v.id,
            video_id: v.videoId,
            title: v.title,
            channel: v.channel,
            channel_id: v.channelId ?? null,
            published_at: v.publishedAt,
            tags: v.tags,
            summary: v.summary,
            key_points: v.keyPoints,
            description: v.description ?? "",
            starred: existing?.starred ?? false,
            user_note: existing?.userNote ?? null,
            read_at: digestReadAtFromDb(existing?.readAt),
          };
        });
        const saveRes = await sbFetch("results", "POST", rows);
        if (saveRes && saveRes.ok === false) {
          setStatus(
            `Digest ran but saving to the database failed: ${saveRes.error}. In Supabase SQL Editor, run the migrations under supabase/migrations/ (adds description, channel_id/starred/user_note/read_at, and unique index on video_id + channel). If columns exist but the error persists, reload the API schema cache in project settings.`
          );
          setStatusType("error");
        }
      } else if (!dbReady && newVideos.length > 0) {
        setStatus(
          `Done — ${newVideos.length} videos analyzed in this session only. Database did not load on startup (check Supabase env vars), so nothing was saved. Refresh after fixing, then run digest again to persist.`
        );
        setStatusType("error");
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

  /** When null, show videos from every channel. When a Set, restrict to normalized channel labels. */
  const visibleChannelNames = useMemo(() => {
    if (channels.length === 0) return null;
    if (visibleChannelIds.size === channels.length) return null;
    return new Set(
      channels
        .filter((c) => visibleChannelIds.has(c.id))
        .map((c) => normalizeChannelLabel(c.name))
    );
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
    if (starredOnly) {
      list = list.filter((v) => v.starred);
    }
    if (visibleChannelNames !== null) {
      if (visibleChannelNames.size === 0) {
        list = [];
      } else {
        list = list.filter((v) =>
          videoMatchesVisibleChannels(
            v,
            visibleChannelNames,
            channels,
            visibleChannelIds
          )
        );
      }
    }
    const tq = titleQuery.trim().toLowerCase();
    if (tq) {
      list = list.filter((v) =>
        decodeHtmlEntities(v.title || "")
          .toLowerCase()
          .includes(tq)
      );
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
  }, [
    videos,
    tagFilter,
    titleQuery,
    visibleChannelNames,
    sortBy,
    channels,
    visibleChannelIds,
    starredOnly,
  ]);

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

  const openDescriptionPopover = async (v, e) => {
    const k = videoRowKey(v);
    if (descPopover?.key === k) {
      setDescPopover(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const w = Math.min(560, Math.max(280, vw - 48));
    let left = r.left;
    const maxLeft = Math.max(8, vw - w - 12);
    if (left > maxLeft) left = maxLeft;
    setDescPopover({
      key: k,
      top: r.bottom + 4,
      left,
      width: w,
    });
    await fetchDescriptionIfNeeded(v);
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="root">
        <a className="rams-skip" href="#main-content">
          Skip to content
        </a>
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
              text="Fetch uploads, summarize, tag for filters—nothing extra."
              font={PT.headerBody}
              lineHeightPx={PT_LH.headerBody}
              style={{ display: "block" }}
            />
          </p>
        </header>

        <main id="main-content">
        <section className="panel" aria-label="Channels">
          <div className="channel-panel-head">
            <p className="r-label" style={{ marginBottom: 0 }}>
              <PretextLines
                as="span"
                text="Channels"
                font={PT.panelLabel}
                lineHeightPx={PT_LH.panelLabel}
                fixedWidth={120}
                style={{ display: "inline-block" }}
              />
            </p>
            <button
              type="button"
              className="btn-text"
              onClick={() => setChannelsPanelHidden((h) => !h)}
              aria-expanded={!channelsPanelHidden}
            >
              <PretextLines
                as="span"
                text={channelsPanelHidden ? "Show channels" : "Hide channels"}
                font={PT.btnText}
                lineHeightPx={PT_LH.btnText}
                fixedWidth={140}
                style={{ display: "inline-block" }}
              />
            </button>
          </div>
          {channelsPanelHidden && channels.length > 0 && (
            <p className="channels-collapsed-hint">
              {channels.length} channel{channels.length === 1 ? "" : "s"} saved — show the list to change digest/view or remove entries.
            </p>
          )}
          {!channelsPanelHidden && channels.length > 0 && (
            <div className="channel-table-wrap">
              <table className="channel-table">
                <thead>
                  <tr>
                    <th scope="col" className="ch-th-cb">
                      <div className="ch-th-stack">
                        <span className="ch-th-title">Digest</span>
                        <span className="ch-th-hint">Include in next run</span>
                        <div className="ch-th-bulk">
                          <button
                            type="button"
                            className={`btn-text ${digestAllOn ? "is-on" : ""}`}
                            onClick={selectAllDigest}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            className={`btn-text ${digestNoneOn ? "is-on" : ""}`}
                            onClick={clearDigestSelection}
                          >
                            None
                          </button>
                        </div>
                      </div>
                    </th>
                    <th scope="col" className="ch-th-cb">
                      <div className="ch-th-stack">
                        <span className="ch-th-title">View</span>
                        <span className="ch-th-hint">Show in results</span>
                        <div className="ch-th-bulk">
                          <button
                            type="button"
                            className={`btn-text ${viewAllOn ? "is-on" : ""}`}
                            onClick={selectAllVisible}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            className={`btn-text ${viewNoneOn ? "is-on" : ""}`}
                            onClick={clearVisibleSelection}
                          >
                            None
                          </button>
                        </div>
                      </div>
                    </th>
                    <th scope="col" className="ch-th-channel r-label">Channel</th>
                    <th scope="col" className="ch-th-id r-label">ID</th>
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
                        <div className="channel-name-row">
                          <ChannelAvatar url={ch.thumbnailUrl} name={ch.name} />
                          <PretextLines
                            text={ch.name}
                            font={PT.tableCell}
                            lineHeightPx={PT_LH.tableCell}
                          />
                        </div>
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
            <input
              placeholder="Channel ID, youtube.com/channel/UC…, or @handle URL"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              aria-label="Channel ID or URL"
            />
            <input
              placeholder="Optional display name (uses YouTube title if empty)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="Optional display name"
            />
            <button
              type="button"
              className="btn"
              onClick={addChannel}
              disabled={resolvingChannel || !newId.trim()}
            >
              <PretextLines
                as="span"
                text={resolvingChannel ? "…" : "Add"}
                font={PT.tableCell}
                lineHeightPx={PT_LH.tableCell}
                fixedWidth={48}
                style={{ display: "inline-block" }}
              />
            </button>
          </div>
          <div className="purge-bar">
            <input
              type="password"
              name="digest-purge-secret"
              autoComplete="off"
              placeholder="Optional purge secret (if configured)"
              value={purgeSecretInput}
              onChange={(e) => setPurgeSecretInput(e.target.value)}
              aria-label="Optional secret for clearing all database data"
            />
            <button
              type="button"
              className="btn"
              onClick={handlePurgeAll}
              disabled={purging || !dbReady}
            >
              <PretextLines
                as="span"
                text={purging ? "Clearing…" : "Clear all data"}
                font={PT.tableCell}
                lineHeightPx={PT_LH.tableCell}
                fixedWidth={120}
                style={{ display: "inline-block" }}
              />
            </button>
          </div>
        </section>

        <div className="toolbar" role="toolbar" aria-label="Digest filters and actions">
          <button
            type="button"
            className="btn primary btn-play"
            onClick={handleRun}
            disabled={running || channels.length === 0 || digestChannelIds.size === 0}
            aria-label={running ? "Running digest" : "Run digest"}
            title={running ? "Running…" : "Run digest"}
          >
            {running ? (
              <span className="spinner" aria-hidden />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <div className="toolbar-field">
            <span className="r-label">
              <PretextLines
                as="span"
                text="Timeframe"
                font={PT.toolbarLabel}
                lineHeightPx={PT_LH.toolbarLabel}
                fixedWidth={72}
                style={{ display: "inline-block" }}
              />
            </span>
            <select className="r-select" value={since} onChange={(e) => setSince(e.target.value)} aria-label="Timeframe">
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
          </div>

          {videos.length > 0 && (
            <div className="toolbar-field">
              <span className="r-label">
                <PretextLines
                  as="span"
                  text="Sort"
                  font={PT.toolbarLabel}
                  lineHeightPx={PT_LH.toolbarLabel}
                  fixedWidth={36}
                  style={{ display: "inline-block" }}
                />
              </span>
              <select className="r-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort">
                <option>Date (Newest)</option>
                <option>Date (Oldest)</option>
                <option>Author (A-Z)</option>
                <option>Author (Z-A)</option>
              </select>
            </div>
          )}

          <label
            className="r-opt toolbar-r-opt"
            title="Off: skip YouTube enrichment for videos already in this digest (lower quota). On: fetch and enrich every video again."
          >
            <input
              type="checkbox"
              checked={forceYoutubeRefresh}
              onChange={(e) => setForceYoutubeRefresh(e.target.checked)}
              disabled={running}
            />
            <span className="r-opt-text">
              <PretextLines
                as="span"
                text="Full YouTube re-fetch (ignore skip list)"
                font={PT.optLabel}
                lineHeightPx={PT_LH.optLabel}
                fixedWidth={280}
                style={{ display: "inline-block", verticalAlign: "middle" }}
              />
            </span>
          </label>

          <div className="toolbar-grow" />

          {videos.length > 0 && (
            <>
              <div className="toolbar-field">
                <span className="r-label">
                  <PretextLines
                    as="span"
                    text="Layout"
                    font={PT.toolbarLabel}
                    lineHeightPx={PT_LH.toolbarLabel}
                    fixedWidth={48}
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
        </div>

        {status && (
          <div className={`status-bar ${statusType}`} role="status" aria-live="polite">
            {statusType === "running" && <div className="spinner" />}
            <span className="status-msg">
              <PretextLines text={status || ""} font={PT.status} lineHeightPx={PT_LH.status} />
            </span>
            {running && (
              <button type="button" className="btn btn-cancel" onClick={handleCancelDigest}>
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

        {videos.length > 0 && filtered.length === 0 && (
          <div className="filter-empty-hint" role="status">
            Nothing matches the current filters. Clear the title search, turn off &quot;Starred only&quot;, set Tags to &quot;All&quot;, or under Channels click &quot;All&quot; next to View so every channel is included.
          </div>
        )}

        {dbReady &&
          videos.length > 0 &&
          channels.length === 0 &&
          !running && (
            <div className="load-hint" role="status">
              Rows are loaded but no channel list was found. Saved items are missing{" "}
              <code style={{ fontSize: 11 }}>channel_id</code>. Add channels in the panel above
              (matching each video&apos;s channel), or run a new digest so rows include channel IDs.
            </div>
          )}

        {dbReady && videos.length === 0 && channels.length > 0 && !running && !status && (
          <div className="load-hint" role="status">
            Channels are saved, but there are no digest rows in the database yet. Use the play
            button to run a digest (with at least one channel checked under Digest).
          </div>
        )}

        {videos.length > 0 && (
          <section className="rams-results" aria-label="Digest results">
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
                <label className="r-opt tag-star-filter">
                  <input
                    type="checkbox"
                    checked={starredOnly}
                    onChange={(e) => setStarredOnly(e.target.checked)}
                  />
                  <span className="r-opt-text">
                    <PretextLines
                      as="span"
                      text="Starred only"
                      font={PT.optLabel}
                      lineHeightPx={PT_LH.optLabel}
                      fixedWidth={100}
                      style={{ display: "inline-block" }}
                    />
                  </span>
                </label>
                <input
                  className="tag-search title-search"
                  type="search"
                  placeholder="Search titles…"
                  value={titleQuery}
                  onChange={(e) => setTitleQuery(e.target.value)}
                  aria-label="Filter by video title"
                />
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

            <div
              ref={digestScrollRef}
              className={`digest-scroll ${viewMode === "grid" ? "digest-grid-view" : "digest-list"}`}
            >
              {filtered.map((v) => {
                const rowKey = videoRowKey(v);
                const mergedDesc = (
                  v.description ||
                  descriptionByVideoId[v.videoId] ||
                  ""
                ).trim();
                const isGrid = viewMode === "grid";
                const normalizedTags = normalizeTags(v.tags);
                const isUnread = digestIsUnread(v.readAt);
                return (
                  <article
                    key={rowKey}
                    className={`video-card ${isGrid ? "video-card--grid" : ""}${isUnread ? " is-unread" : ""}`}
                  >
                    <div className="card-main">
                    <div className="card-top">
                      {v.videoId ? (
                        <a
                          className="thumb-link"
                          href={youtubeWatchUrl(v.videoId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open video on YouTube: ${decodeHtmlEntities(v.title)}`}
                        >
                          <img
                            className="thumb"
                            src={`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                            alt=""
                          />
                        </a>
                      ) : (
                        <div
                          className="thumb-link thumb-link--placeholder"
                          aria-hidden
                        >
                          <div
                            className="thumb"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <PretextLines
                              as="span"
                              text="—"
                              font={PT.tableCell}
                              lineHeightPx={PT_LH.tableCell}
                              fixedWidth={24}
                              style={{ display: "inline-block" }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="card-meta">
                        <div className="card-title">
                          <PretextLines
                            as="span"
                            text={decodeHtmlEntities(v.title)}
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
                            text={decodeHtmlEntities(v.channel)}
                            font={PT.cardChannel}
                            lineHeightPx={PT_LH.cardChannel}
                            maxLines={2}
                            style={{ display: "block" }}
                          />
                        </div>
                        <div className="card-actions">
                          <button
                            type="button"
                            className={`star-btn ${v.starred ? "is-starred" : ""}`}
                            aria-pressed={Boolean(v.starred)}
                            aria-label={v.starred ? "Remove star" : "Star this video"}
                            onClick={() => toggleStar(v)}
                          >
                            ★
                          </button>
                          <button
                            type="button"
                            className="read-toggle"
                            aria-pressed={!digestIsUnread(v.readAt)}
                            aria-label={
                              digestIsUnread(v.readAt)
                                ? "Mark as read"
                                : "Mark as not read"
                            }
                            title={
                              digestIsUnread(v.readAt)
                                ? "New — click to mark as read"
                                : "Marked read — click to show as new"
                            }
                            onClick={() => toggleRead(v)}
                          >
                            {digestIsUnread(v.readAt) ? "New" : "Read"}
                          </button>
                          {isGrid ? (
                            <>
                              <div
                                className={`card-tags-popover-wrap ${tagsPopover?.key === rowKey ? "is-open" : ""}`}
                                data-tags-popover-root
                              >
                                <button
                                  type="button"
                                  className={`card-tags-trigger ${tagsPopover?.key === rowKey ? "is-open" : ""}`}
                                  onClick={(e) => {
                                    if (tagsPopover?.key === rowKey) {
                                      setTagsPopover(null);
                                      return;
                                    }
                                    const r = e.currentTarget.getBoundingClientRect();
                                    const w = Math.max(r.width, 200);
                                    const vw =
                                      typeof window !== "undefined"
                                        ? window.innerWidth
                                        : 400;
                                    let left = r.left;
                                    const maxLeft = Math.max(8, vw - w - 12);
                                    if (left > maxLeft) left = maxLeft;
                                    setTagsPopover({
                                      key: rowKey,
                                      top: r.bottom + 4,
                                      left,
                                      width: w,
                                    });
                                  }}
                                  aria-expanded={tagsPopover?.key === rowKey}
                                  aria-controls={`tags-pop-${rowKey}`}
                                  id={`tags-trigger-${rowKey}`}
                                >
                                  <PretextLines
                                    as="span"
                                    text={`Tags (${normalizedTags.length})`}
                                    font={PT.badge}
                                    lineHeightPx={PT_LH.badge}
                                    fixedWidth={200}
                                    style={{ display: "inline-block" }}
                                  />
                                </button>
                              </div>
                              {tagsPopover?.key === rowKey &&
                                typeof document !== "undefined" &&
                                createPortal(
                                  <div
                                    id={`tags-pop-${rowKey}`}
                                    data-tags-popover-floating
                                    className="card-tags-popover card-tags-popover--floating"
                                    role="dialog"
                                    aria-label="Video tags"
                                    aria-labelledby={`tags-trigger-${rowKey}`}
                                    style={{
                                      position: "fixed",
                                      top: tagsPopover.top,
                                      left: tagsPopover.left,
                                      width: tagsPopover.width,
                                      zIndex: 10000,
                                    }}
                                  >
                                    {normalizedTags.length === 0 ? (
                                      <span className="card-tags-popover-empty">No tags</span>
                                    ) : (
                                      normalizedTags.map((t) => (
                                        <span key={t} className="badge">
                                          <PretextLines
                                            as="span"
                                            text={decodeHtmlEntities(t)}
                                            font={PT.badge}
                                            lineHeightPx={PT_LH.badge}
                                            fixedWidth={240}
                                            style={{ display: "inline-block" }}
                                          />
                                        </span>
                                      ))
                                    )}
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
                                  </div>,
                                  document.body
                                )}
                            </>
                          ) : (
                            <div className="card-tags-scroll" aria-label="Tags">
                              {normalizedTags.map((t) => (
                                <span key={t} className="badge">
                                  <PretextLines
                                    as="span"
                                    text={decodeHtmlEntities(t)}
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
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="summary-text">
                      <PretextLines
                        as="span"
                        text={decodeHtmlEntities(v.summary || "")}
                        font={isGrid ? PT.summaryGrid : PT.summaryList}
                        lineHeightPx={
                          isGrid ? PT_LH.summaryGrid : PT_LH.summaryList
                        }
                        maxLines={isGrid ? 6 : undefined}
                        style={{ display: "block" }}
                      />
                    </p>

                    <div className="card-note-label">Note</div>
                    <textarea
                      className="card-note"
                      value={v.userNote ?? ""}
                      onChange={(e) => onNoteChange(v, e.target.value)}
                      placeholder="Private notes…"
                      rows={2}
                      aria-label={`Notes for ${v.title || "video"}`}
                    />

                    {v.videoId && (
                      <div className="desc-popover-wrap" data-desc-popover-root>
                        <button
                          type="button"
                          className={`desc-popover-trigger ${descPopover?.key === rowKey ? "is-open" : ""}`}
                          onClick={(e) => openDescriptionPopover(v, e)}
                          aria-expanded={descPopover?.key === rowKey}
                          aria-controls={`desc-pop-${rowKey}`}
                          id={`desc-trigger-${rowKey}`}
                        >
                          <PretextLines
                            as="span"
                            text="Original description"
                            font={PT.expandBtn}
                            lineHeightPx={PT_LH.expandBtn}
                            fixedWidth={200}
                            style={{ display: "inline-block" }}
                          />
                        </button>
                        {descPopover?.key === rowKey &&
                          typeof document !== "undefined" &&
                          createPortal(
                            <div
                              id={`desc-pop-${rowKey}`}
                              data-desc-popover-floating
                              className="desc-popover-floating"
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby={`desc-trigger-${rowKey}`}
                              style={{
                                position: "fixed",
                                top: descPopover.top,
                                left: descPopover.left,
                                width: descPopover.width,
                                zIndex: 10001,
                              }}
                            >
                              <div className="desc-popover-floating-head">
                                <PretextLines
                                  as="span"
                                  text="Original description"
                                  font={PT.expandBtn}
                                  lineHeightPx={PT_LH.expandBtn}
                                  fixedWidth={180}
                                  style={{ display: "inline-block" }}
                                />
                                <button
                                  type="button"
                                  className="desc-popover-floating-close"
                                  onClick={() => setDescPopover(null)}
                                  aria-label="Close description"
                                >
                                  ×
                                </button>
                              </div>
                              <div className="r-expand-body desc-linkified desc-popover-floating-inner">
                                {loadingDescId === rowKey && !mergedDesc ? (
                                  <PretextLines
                                    text="Loading…"
                                    font={PT.expandBody}
                                    lineHeightPx={PT_LH.expandBody}
                                  />
                                ) : mergedDesc ? (
                                  linkifyDescription(mergedDesc)
                                ) : (
                                  <PretextLines
                                    text="No description available."
                                    font={PT.expandBody}
                                    lineHeightPx={PT_LH.expandBody}
                                    style={{ color: "var(--r-text-faint)" }}
                                  />
                                )}
                              </div>
                            </div>,
                            document.body
                          )}
                      </div>
                    )}
                    </div>

                    <div className="card-footer">
                      <div className="card-footer-start">
                        {v.videoId ? (
                          <a
                            className="watch-link-yt"
                            href={youtubeWatchUrl(v.videoId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open on YouTube"
                            title="Open on YouTube"
                          >
                            <YoutubeMarkIcon />
                          </a>
                        ) : (
                          <span className="watch-link-yt" aria-hidden style={{ opacity: 0.35 }}>
                            <YoutubeMarkIcon />
                          </span>
                        )}
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
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteResult(v.videoId, v.channel)}
                        className="remove-btn card-footer-delete"
                        title="Remove"
                        aria-label="Remove result"
                      >
                        ×
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!running &&
          videos.length === 0 &&
          !status &&
          channels.length === 0 && (
          <div className="empty-state">
            <p>
              Add channels, run digest. Results appear below; switch layout between grid and list in the toolbar.
            </p>
          </div>
        )}
        </main>
      </div>
    </>
  );
}
