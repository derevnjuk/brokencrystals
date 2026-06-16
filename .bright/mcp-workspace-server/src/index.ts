import { WebSocketClientTransport } from './ws-transport.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const STAR_WS_URL = process.env.STAR_WS_URL ?? '';
const RUN_ID = process.env.RUN_ID ?? '';
const STAR_WS_TOKEN = process.env.STAR_WS_TOKEN ?? '';
const WORKDIR = process.env.WORKDIR ?? process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor']);

// log emits one structured JSON line per event to stderr so tool execution is visible in
// the CI job log (stdout is reserved for nothing in particular here, but stderr keeps logs
// clearly separated from any accidental stdout output).
function log(event: string, fields: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ts: new Date().toISOString(), runId: RUN_ID, event, ...fields }));
}

const server = new McpServer({
  name: 'star-mcp-workspace',
  version: '0.1.0'
});

// get_file_content mirrors vcs.Client.GetFileContent — returns the full file as text.
server.registerTool('get_file_content', {
  description: 'Return the full UTF-8 content of a repository file.',
  inputSchema: { path: z.string().min(1).describe('Repository-relative file path.') }
}, async ({ path: filePath }) => {
  const start = Date.now();
  log('tool.call', { tool: 'get_file_content', path: filePath });
  try {
    const content = await readFile(join(WORKDIR, filePath), 'utf-8');
    log('tool.ok', { tool: 'get_file_content', path: filePath, bytes: content.length, ms: Date.now() - start });

    return { content: [{ type: 'text', text: content }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('tool.error', { tool: 'get_file_content', path: filePath, error: msg, ms: Date.now() - start });

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

// get_files mirrors vcs.Client.GetFiles — returns the full recursive file tree.
server.registerTool('get_files', {
  description: 'Return the recursive list of repository files as JSON [{path,type}].',
  inputSchema: {}
}, async () => {
  const start = Date.now();
  log('tool.call', { tool: 'get_files' });
  try {
    const files: { path: string; type: string }[] = [];
    await walk(WORKDIR, files);
    log('tool.ok', { tool: 'get_files', count: files.length, ms: Date.now() - start });

    return { content: [{ type: 'text', text: JSON.stringify(files) }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('tool.error', { tool: 'get_files', error: msg, ms: Date.now() - start });

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

// get_directory_contents mirrors vcs.Client.GetDirectoryContents — immediate children only.
server.registerTool('get_directory_contents', {
  description: 'Return immediate children of a directory as JSON [{path,type}].',
  inputSchema: { path: z.string().optional().describe('Directory path relative to repo root.') }
}, async ({ path: dirPath }) => {
  const start = Date.now();
  const rel = dirPath ?? '.';
  log('tool.call', { tool: 'get_directory_contents', path: rel });
  try {
    const entries = await readdir(join(WORKDIR, rel), { withFileTypes: true });
    const result = entries.map(e => ({
      path: rel === '.' ? e.name : `${rel}/${e.name}`,
      type: e.isDirectory() ? 'tree' : 'blob'
    }));
    log('tool.ok', { tool: 'get_directory_contents', path: rel, count: result.length, ms: Date.now() - start });

    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('tool.error', { tool: 'get_directory_contents', path: rel, error: msg, ms: Date.now() - start });

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

// splitLines normalizes EOLs and drops a single trailing empty line from a final newline.
function splitLines(content: string): string[] {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

// read_file returns only the requested 1-based line range — the key advantage of local
// access over the VCS API, which would transfer the whole file.
server.registerTool('read_file', {
  description: 'Read a bounded line range from a repository file (1-based offset, limited count).',
  inputSchema: {
    path: z.string().min(1).describe('Repository-relative file path.'),
    offset: z.number().int().optional().describe('1-based starting line. Defaults to 1.'),
    limit: z.number().int().optional().describe('Max lines to read. Defaults to 50.')
  }
}, async ({ path: filePath, offset, limit }) => {
  const start = Date.now();
  const off = offset && offset > 0 ? offset : 1;
  const lim = limit && limit > 0 ? limit : 50;
  log('tool.call', { tool: 'read_file', path: filePath, offset: off, limit: lim });
  try {
    const content = await readFile(join(WORKDIR, filePath), 'utf-8');
    const lines = splitLines(content).slice(off - 1, off - 1 + lim);
    log('tool.ok', { tool: 'read_file', path: filePath, lines: lines.length, ms: Date.now() - start });

    return { content: [{ type: 'text', text: JSON.stringify({ lines }) }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('tool.error', { tool: 'read_file', path: filePath, error: msg, ms: Date.now() - start });

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

// grep_search runs the match natively on the local file and returns only matching lines
// plus context — never the whole file.
server.registerTool('grep_search', {
  description: 'Search one repository file for a substring or regex; returns matches with context.',
  inputSchema: {
    path: z.string().min(1).describe('Repository-relative file path.'),
    query: z.string().min(1).describe('Substring or regex to search for.'),
    before: z.number().int().optional().describe('Context lines before each match. Defaults to 5.'),
    after: z.number().int().optional().describe('Context lines after each match. Defaults to 5.'),
    caseSensitive: z.boolean().optional(),
    isRegex: z.boolean().optional()
  }
}, async ({ path: filePath, query, before, after, caseSensitive, isRegex }) => {
  const start = Date.now();
  const b = before && before > 0 ? before : 5;
  const a = after && after > 0 ? after : 5;
  log('tool.call', { tool: 'grep_search', path: filePath, query, isRegex: isRegex ?? false });
  try {
    const lines = splitLines(await readFile(join(WORKDIR, filePath), 'utf-8'));
    const matcher = buildMatcher(query, caseSensitive ?? false, isRegex ?? false);
    const matches: { lineNumber: number; content: string; before: string[]; after: string[] }[] = [];
    let hasMore = false;

    for (let i = 0; i < lines.length; i++) {
      if (!matcher(lines[i])) {
        continue;
      }
      if (matches.length >= 50) {
        hasMore = true;
        break;
      }
      matches.push({
        lineNumber: i + 1,
        content: lines[i],
        before: lines.slice(Math.max(0, i - b), i),
        after: lines.slice(i + 1, Math.min(lines.length, i + 1 + a))
      });
    }

    log('tool.ok', { tool: 'grep_search', path: filePath, count: matches.length, ms: Date.now() - start });

    return { content: [{ type: 'text', text: JSON.stringify({ matches, count: matches.length, hasMore }) }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log('tool.error', { tool: 'grep_search', path: filePath, error: msg, ms: Date.now() - start });

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

function buildMatcher(query: string, caseSensitive: boolean, isRegex: boolean): (line: string) => boolean {
  if (isRegex) {
    const re = new RegExp(query, caseSensitive ? '' : 'i');

    return (line: string): boolean => re.test(line);
  }

  const needle = caseSensitive ? query : query.toLowerCase();

  return (line: string): boolean => (caseSensitive ? line : line.toLowerCase()).includes(needle);
}

async function walk(dir: string, acc: { path: string; type: string }[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(WORKDIR, full);

    if (!entry.isDirectory()) {
      acc.push({ path: rel, type: 'blob' });
      continue;
    }

    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }

    acc.push({ path: rel, type: 'tree' });
    await walk(full, acc);
  }
}

async function main(): Promise<void> {
  if (!STAR_WS_URL || !RUN_ID) {
    throw new Error('STAR_WS_URL and RUN_ID are required');
  }

  const url = new URL(STAR_WS_URL);
  url.searchParams.set('run', RUN_ID);

  log('server.connecting', { host: url.host, workdir: WORKDIR });
  const transport = new WebSocketClientTransport(url, STAR_WS_TOKEN);
  await server.connect(transport);

  log('server.connected', { host: url.host });
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  log('server.failed', { error: msg });
  process.exitCode = 1;
});
