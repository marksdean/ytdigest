# YouTube Digest Agent (V3)

A production-ready Next.js application that autonomously monitors specific YouTube channels, fetches long-term video histories, and utilizes Claude AI to dynamically generate fine-grained, highly specific subject tags and summaries without hallucination.

## 🚀 V3 Features
- **Deep Historical Sourcing:** Bypasses standard 15-video RSS limits by parsing official uploads playlists, fetching up to **100 historical videos** per channel natively.
- **Intelligent Prompt Batching:** Bypasses strict LLM output limit crashes by natively queueing up payloads and sending automated chunks of 20 videos at a time sequentially to the Anthropic API proxy.
- **Dynamic Subject Tagging:** No more hardcoded static categories. Claude actively reads real video descriptions and dynamically generates organic categories (e.g., `music theory`, `react`, `chords`, `ai models`).
- **Resilient Persistence:** Processed feeds, summaries, and tags are cleanly serialized to the browser's `localStorage` to survive page refreshes instantly and prevent unnecessary API credit burn.
- **Advanced GUI Control Arrays:** Features an active 'Timeframe' bounding filter, a 'Channel' isolation dropdown, and rigorous Author + Date 'Sort By' mechanisms.
- **Secure Backend API Proxies:** Client-side API key inputs have been removed entirely. The layout strictly relies on scalable, server-side Next.js route handlers (`/api/anthropic` and `/api/youtube`) to prevent API Key exposure and CORS failures!

## 💻 Local Setup

1. **Clone & Install**
   ```bash
   git clone https://github.com/marksdean/ytdigest.git
   cd ytdigest
   npm install
   ```

2. **Environment Configuration**
   Create a `.env.local` file in the root directory and configure your API Keys securely:
   ```env
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   YOUTUBE_API_KEY=your-youtube-v3-api-key
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key
   DIGEST_AGENT_SECRET=generate-a-long-random-secret
   YTDIGEST_BASE_URL=http://localhost:3000
   ```
   `DIGEST_AGENT_SECRET` secures `/api/agent/*`. Use the **same** value in Vercel for production. `YTDIGEST_BASE_URL` is the origin MCP tools call (local dev URL above, or your deployed `https://…vercel.app`).

3. **Cursor MCP (optional)**
   This repo includes [`.cursor/mcp.json`](.cursor/mcp.json). It runs [`mcp-server/index.js`](mcp-server/index.js) with `cwd` set to the workspace and loads secrets from **`.env.local`** (see `mcp-server/load-env.js`). Install MCP deps once: `cd mcp-server && npm install`. Then in Cursor, enable the **youtube-digest** MCP server (Settings → MCP) and reload the window if needed. If `${workspaceFolder}` is not expanded on your Cursor version, edit `mcp.json` and set `"cwd"` to the absolute path of this repository.

4. **Launch the Architecture**
   ```bash
   npm run dev
   ```
   Navigate effortlessly to `http://localhost:3000` to start executing automated digests!

## ☁️ Vercel Deployment

This project is built explicitly on the **Next.js App Router** and is fully ready to deploy gracefully to Vercel edge/serverless infrastructure.

1. Connect your repository to Vercel.
2. Under Project Settings > **Environment Variables**, provide your `ANTHROPIC_API_KEY` identically.
3. Hit Deploy! Vercel automatically secures and binds all relative `/api/anthropic` proxies out-of-the-box.
