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
    return {
      content: [
        {
          type: 'text',
          text:
            'Set YTDIGEST_BASE_URL (or MCP_YTDIGEST_BASE_URL) to your deployed app origin and DIGEST_AGENT_SECRET to match the server env.',
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
  const res = await fetch(url, { ...init, headers });
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
    return { content: [{ type: 'text', text: out }], isError: true };
  }
  return { content: [{ type: 'text', text: out }] };
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
