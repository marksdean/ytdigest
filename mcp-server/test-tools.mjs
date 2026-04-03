/**
 * Smoke-test the same HTTP calls the MCP stdio server makes (no MCP protocol).
 * Run: node mcp-server/test-tools.mjs
 */
import './load-env.js';

const baseUrl = (
  process.env.YTDIGEST_BASE_URL ||
  process.env.MCP_YTDIGEST_BASE_URL ||
  ''
).replace(/\/$/, '');
const token = process.env.DIGEST_AGENT_SECRET || '';

async function req(path, init = {}) {
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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 400) };
  }
  return { res, json, text };
}

function pass(name) {
  console.log(`  OK  ${name}`);
}

function fail(name, err) {
  console.log(`  FAIL ${name}: ${err}`);
  process.exitCode = 1;
}

async function main() {
  console.log('MCP tool smoke test (HTTP parity with mcp-server/index.js)\n');
  console.log(`  base: ${baseUrl || '(missing)'}`);
  console.log(`  token: ${token ? 'set' : '(missing)'}\n`);

  if (!baseUrl || !token) {
    console.error('Set YTDIGEST_BASE_URL and DIGEST_AGENT_SECRET in .env.local');
    process.exit(1);
  }

  // list_channels
  {
    const { res, json } = await req('/api/agent/channels');
    if (!res.ok) fail('list_channels', `${res.status} ${JSON.stringify(json)}`);
    else {
      const n = Array.isArray(json.channels) ? json.channels.length : 0;
      pass(`list_channels (${n} channels)`);
    }
  }

  // search_youtube_channels
  {
    const q = new URLSearchParams({ q: 'piano tutorial', maxResults: '3' });
    const { res, json } = await req(`/api/agent/search-channels?${q}`);
    if (!res.ok) fail('search_youtube_channels', `${res.status} ${JSON.stringify(json)}`);
    else {
      const n = Array.isArray(json.items) ? json.items.length : 0;
      pass(`search_youtube_channels (${n} items)`);
    }
  }

  // list_digest_results
  {
    const { res, json } = await req('/api/agent/digest-results');
    if (!res.ok) fail('list_digest_results', `${res.status} ${JSON.stringify(json)}`);
    else {
      const n = Array.isArray(json.results) ? json.results.length : 0;
      pass(`list_digest_results (${n} results)`);
    }
  }

  // run_digest — empty channelIds: fast 400, no LLM (full digest is slow/expensive)
  {
    const { res, json } = await req('/api/agent/digest', {
      method: 'POST',
      body: JSON.stringify({
        channelIds: [],
        save: false,
      }),
    });
    if (res.status === 400 && String(json.error || '').includes('channelIds')) {
      pass('run_digest (route reachable; 400 for empty channelIds as expected)');
    } else {
      fail('run_digest', `${res.status} ${JSON.stringify(json)}`);
    }
  }

  console.log('\nDone. Exit code:', process.exitCode ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
