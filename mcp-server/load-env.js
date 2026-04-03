/**
 * Load repo-root `.env.local` into `process.env` before tools run (stdio MCP has no shell env).
 * - Finds `.env.local` even when Cursor's `cwd` is wrong (walks up from `process.cwd()`).
 * - Fills vars that are missing *or empty* so a blank `env` in mcp.json does not block values from the file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findEnvLocalPath() {
  const fromMcpDir = resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local');
  if (existsSync(fromMcpDir)) return fromMcpDir;

  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const p = join(dir, '.env.local');
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envPath = findEnvLocalPath();
if (envPath) {
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const cur = process.env[key];
    const curEmpty = cur === undefined || cur === null || String(cur).trim() === '';
    if (curEmpty && val !== '') {
      process.env[key] = val;
    }
  }
}
