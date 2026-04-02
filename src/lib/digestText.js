/**
 * Shared text helpers for server-side digest (mirrors client page.js).
 */

/** Decode `&#39;`, `&amp;`, etc. from API/LLM titles and text (no DOM). */
export function decodeHtmlEntities(raw) {
  if (raw == null) return '';
  const s = String(raw);
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Tags from #hashtags in video description (supports phrases like #piano lessons). */
export function extractHashtagsFromText(text) {
  if (text == null || typeof text !== 'string') return [];
  const out = [];
  const re = /#([^\s#]+(?:\s+[^\s#]+)*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].trim().replace(/\s+/g, ' ');
    if (t.length > 0 && t.length <= 120) out.push(t);
  }
  return [...new Set(out)];
}

/** Dedupe by case-insensitive key; preserve first-seen casing. */
export function mergeTagArrays(...lists) {
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
