import './load-env.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

function getEnv() {
  const baseUrl = (
    process.env.YTDIGEST_BASE_URL ||
    process.env.MCP_YTDIGEST_BASE_URL ||
    ''
  ).replace(/\/$/, '');
  const token = process.env.DIGEST_AGENT_SECRET || '';
  return { baseUrl, token };
}

async function agentFetch(path, init = {}) {
  const { baseUrl, token } = getEnv();
  if (!baseUrl || !token) {
    const missing = [
      !baseUrl && 'YTDIGEST_BASE_URL (or MCP_YTDIGEST_BASE_URL)',
      !token && 'DIGEST_AGENT_SECRET',
    ]
      .filter(Boolean)
      .join(' and ');
    return {
      content: [
        {
          type: 'text',
          text:
            `Missing: ${missing}.\n\n` +
            'Add them to `.env.local` in the project root (no quotes needed), or set `env` on this MCP server in Cursor. ' +
            '`YTDIGEST_BASE_URL` must be the Next app origin only, e.g. `https://your-app.vercel.app` or `http://127.0.0.1:3000`. ' +
            '`DIGEST_AGENT_SECRET` must match the value in Vercel (production) or `.env.local` (local dev server).',
        },
      ],
      isError: true,
    };
  }
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...init.headers,
  };
  if (init.body != null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text:
            `Network error calling ${url}\n${err?.message || String(err)}\n\n` +
            'If using localhost, start the app with `npm run dev`. Check YTDIGEST_BASE_URL has no trailing path.',
        },
      ],
      isError: true,
    };
  }
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  const out =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  if (!res.ok) {
    const snippet =
      typeof text === 'string' && text.length > 1800
        ? `${text.slice(0, 1800)}\n…(truncated)`
        : text;
    let hint = '';
    if (res.status === 401) {
      hint =
        '\n\n401: Bearer token mismatch. Set DIGEST_AGENT_SECRET in `.env.local` to the exact value configured on the server (Vercel → Environment Variables for your deployment URL).';
    } else if (res.status === 503) {
      hint =
        '\n\n503: Server reports missing DIGEST_AGENT_SECRET. Add it in Vercel env and redeploy, or run Next locally with the same secret in `.env.local`.';
    } else if (res.status === 404) {
      hint =
        '\n\n404: No route at this URL. Point YTDIGEST_BASE_URL at a deployment that includes `/api/agent/*` (redeploy after adding agent routes), or use `http://127.0.0.1:3000` with `npm run dev`.';
    }
    return {
      content: [
        {
          type: 'text',
          text: `HTTP ${res.status} ${res.statusText}\nRequest: ${init.method || 'GET'} ${url}\n\nBody:\n${snippet}${hint}`,
        },
      ],
      isError: true,
    };
  }
  return { content: [{ type: 'text', text: out }] };
}

if (typeof process.stderr?.write === 'function') {
  const { baseUrl, token } = getEnv();
  if (!baseUrl || !token) {
    process.stderr.write(
      '[youtube-digest-mcp] After loading .env.local: need YTDIGEST_BASE_URL and DIGEST_AGENT_SECRET. Tools will return errors until both are set.\n'
    );
  }
}

const server = new McpServer(
  { name: 'youtube-digest-mcp', version: '1.0.0' },
  {
    instructions:
      'Call the youtube-digest Next.js app agent APIs. Requires YTDIGEST_BASE_URL and DIGEST_AGENT_SECRET.',
  }
);

server.registerTool(
  'search_youtube_channels',
  {
    description: 'Search YouTube for channels (search.list type=channel).',
    inputSchema: z.object({
      q: z.string().min(1),
      maxResults: z.number().int().min(1).max(50).optional(),
    }),
  },
  async ({ q, maxResults }) => {
    const params = new URLSearchParams({ q });
    if (maxResults != null) params.set('maxResults', String(maxResults));
    return agentFetch(`/api/agent/search-channels?${params.toString()}`);
  }
);

server.registerTool(
  'list_channels',
  {
    description: 'List saved channels from Supabase.',
    inputSchema: z.object({}),
  },
  async () => agentFetch('/api/agent/channels')
);

server.registerTool(
  'merge_channels',
  {
    description:
      'Add or update channels by id (merge mode). Body: channels [{ id, name, thumbnail_url? }].',
    inputSchema: z.object({
      channels: z.array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          thumbnail_url: z.string().nullable().optional(),
        })
      ),
      mode: z.enum(['merge', 'replace']).optional(),
    }),
  },
  async ({ channels, mode }) => {
    return agentFetch('/api/agent/channels', {
      method: 'POST',
      body: JSON.stringify({ channels, mode: mode ?? 'merge' }),
    });
  }
);

server.registerTool(
  'list_digest_results',
  {
    description: 'List digest results, optional title filter q.',
    inputSchema: z.object({ q: z.string().optional() }),
  },
  async ({ q }) => {
    const params = new URLSearchParams();
    if (q && q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    return agentFetch(
      `/api/agent/digest-results${qs ? `?${qs}` : ''}`
    );
  }
);

server.registerTool(
  'run_digest',
  {
    description:
      'Run server-side digest for selected channel IDs (must exist in channels table). Optional save to DB.',
    inputSchema: z.object({
      channelIds: z.array(z.string()).min(1),
      since: z.string().optional(),
      save: z.boolean().optional(),
      forceRefresh: z.boolean().optional(),
    }),
  },
  async ({ channelIds, since, save, forceRefresh }) => {
    return agentFetch('/api/agent/digest', {
      method: 'POST',
      body: JSON.stringify({
        channelIds,
        since: since ?? '1 month',
        save: Boolean(save),
        forceRefresh: Boolean(forceRefresh),
      }),
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
