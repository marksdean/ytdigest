# YouTube Digest Agent (V3)

A Next.js app that monitors YouTube channels, fetches video metadata, and uses Claude (via `/api/anthropic`) to produce tags and summaries. Results persist in **Supabase** (`channels`, `digest_results`).

## Features

- **Historical sourcing:** Uploads playlist and search APIs for deeper history than RSS-only limits.
- **Batched analysis:** Chunks of videos sent to the Anthropic API to stay within output limits.
- **Dynamic tags:** Subject tags and hashtags merged from descriptions.
- **Supabase persistence:** Channels and digest rows stored server-side; optional purge secret for resets.
- **Agent API + MCP:** Bearer-protected `/api/agent/*` routes and a stdio MCP server for tools (search, list/merge channels, list results, run digest).

## Local setup

1. **Clone and install**
   ```bash
   git clone https://github.com/marksdean/ytdigest.git
   cd ytdigest
   npm install
   cd mcp-server && npm install && cd ..
   ```

2. **Environment** — create `.env.local` in the repo root:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   YOUTUBE_API_KEY=...
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=...   # or SUPABASE_SERVICE_ROLE_KEY
   DIGEST_AGENT_SECRET=...    # long random string; same as Vercel for production
   YTDIGEST_BASE_URL=http://127.0.0.1:3000
   ```
   - **`DIGEST_AGENT_SECRET`** protects `/api/agent/*`.
   - **`YTDIGEST_BASE_URL`** is the **origin only** (no path): local dev URL above, or `https://your-app.vercel.app` when MCP/tools should hit production.

3. **Run**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

4. **Supabase** — apply SQL in `supabase/migrations/` (in order), including `digest_results` columns and `channels.thumbnail_url` if needed. Reload the API schema cache in Supabase if PostgREST errors on new columns.

## Vercel deployment

In **Project → Environment Variables** (Production), set at least:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) |
| `DIGEST_AGENT_SECRET` | Same value you use locally for MCP / curl to `/api/agent/*` |

Redeploy after changing secrets or adding routes.

## Agent API (Bearer auth)

All routes expect:
```http
Authorization: Bearer <DIGEST_AGENT_SECRET>
```

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/agent/search-channels?q=...&maxResults=...` | YouTube channel search |
| `GET` | `/api/agent/channels` | List channels (table + inference from digest when table empty) |
| `POST` | `/api/agent/channels` | Body: `{ channels: [{ id, name, thumbnail_url? }], mode?: "merge" \| "replace" }` |
| `GET` | `/api/agent/digest-results?q=...` | List `digest_results` (optional title filter) |
| `POST` | `/api/agent/digest` | Body: `{ channelIds, since?, save?, forceRefresh? }` — server-side digest (long-running; Vercel timeout limits apply) |

## MCP server (Cursor)

- **Config:** [`.cursor/mcp.json`](.cursor/mcp.json) runs `node mcp-server/index.js` with workspace `cwd`.
- **Env:** [`mcp-server/load-env.js`](mcp-server/load-env.js) loads `.env.local` (and tolerates a wrong `cwd` by resolving paths). Set **`YTDIGEST_BASE_URL`** and **`DIGEST_AGENT_SECRET`**.
- **Install:** `cd mcp-server && npm install`
- **Run stdio server manually:** `npm run mcp` (from repo root)
- **Smoke test (HTTP only, no Cursor):** `npm run test:mcp` — checks the same URLs the MCP tools call.

**Tools exposed:** `search_youtube_channels`, `list_channels`, `merge_channels`, `list_digest_results`, `run_digest`.

**Troubleshooting:** **401** = wrong `DIGEST_AGENT_SECRET` vs Vercel. **404** = `YTDIGEST_BASE_URL` wrong or old deploy without `/api/agent/*`. **503** = server missing `DIGEST_AGENT_SECRET`. Check stderr for `[youtube-digest-mcp]`.

**`list_channels` vs UI:** If the `channels` table is empty, the API (and UI) can **infer** channels from `digest_results` (`channel_id` + `channel`). Inferred API rows may include `"inferred": true`.

## Example queries

### In Cursor (Agent + youtube-digest MCP)

Use natural language; the agent should pick the right tool:

- “List my saved channels using the youtube-digest MCP tools.”
- “Search YouTube for channels matching `jazz piano` and return channel IDs and titles.”
- “Merge channel `UC…` with name `Example Channel` using merge_channels.”
- “Show digest results whose titles contain `React`.”
- “Run a digest for channel IDs `[…]` for the last week and **do not** save to the database (`save: false`).”

### curl (replace URL and secret)

```bash
export YTDIGEST_BASE_URL="https://your-app.vercel.app"
export DIGEST_AGENT_SECRET="your-secret"

# List channels
curl -sS -H "Authorization: Bearer $DIGEST_AGENT_SECRET" \
  "$YTDIGEST_BASE_URL/api/agent/channels"

# Search channels
curl -sS -H "Authorization: Bearer $DIGEST_AGENT_SECRET" \
  "$YTDIGEST_BASE_URL/api/agent/search-channels?q=piano&maxResults=5"

# List digest results (optional title filter)
curl -sS -H "Authorization: Bearer $DIGEST_AGENT_SECRET" \
  "$YTDIGEST_BASE_URL/api/agent/digest-results?q=typescript"

# Merge channels (upsert by YouTube channel id)
curl -sS -X POST -H "Authorization: Bearer $DIGEST_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"channels":[{"id":"UCxxxxxxxxxxxxxxxxxxxxxx","name":"Channel Name"}],"mode":"merge"}' \
  "$YTDIGEST_BASE_URL/api/agent/channels"

# Run digest (long request; requires channel ids present in `channels` table)
curl -sS -X POST -H "Authorization: Bearer $DIGEST_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"channelIds":["UCxxxxxxxxxxxxxxxxxxxxxx"],"since":"1 month","save":true,"forceRefresh":false}' \
  "$YTDIGEST_BASE_URL/api/agent/digest"
```

### Health check without Cursor

```bash
npm run test:mcp
```

Expect `OK` lines for list/search/digest-results and a successful `run_digest` route check (empty `channelIds` returns 400 by design).
