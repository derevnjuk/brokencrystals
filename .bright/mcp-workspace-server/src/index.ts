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

const server = new McpServer({
  name: 'star-mcp-workspace',
  version: '0.1.0'
});

// get_file_content mirrors vcs.Client.GetFileContent — returns the full file as text.
server.registerTool('get_file_content', {
  description: 'Return the full UTF-8 content of a repository file.',
  inputSchema: { path: z.string().min(1).describe('Repository-relative file path.') }
}, async ({ path: filePath }) => {
  try {
    const content = await readFile(join(WORKDIR, filePath), 'utf-8');

    return { content: [{ type: 'text', text: content }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

// get_files mirrors vcs.Client.GetFiles — returns the full recursive file tree.
server.registerTool('get_files', {
  description: 'Return the recursive list of repository files as JSON [{path,type}].',
  inputSchema: {}
}, async () => {
  try {
    const files: { path: string; type: string }[] = [];
    await walk(WORKDIR, files);

    return { content: [{ type: 'text', text: JSON.stringify(files) }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

// get_directory_contents mirrors vcs.Client.GetDirectoryContents — immediate children only.
server.registerTool('get_directory_contents', {
  description: 'Return immediate children of a directory as JSON [{path,type}].',
  inputSchema: { path: z.string().optional().describe('Directory path relative to repo root.') }
}, async ({ path: dirPath }) => {
  try {
    const rel = dirPath ?? '.';
    const entries = await readdir(join(WORKDIR, rel), { withFileTypes: true });
    const result = entries.map(e => ({
      path: rel === '.' ? e.name : `${rel}/${e.name}`,
      type: e.isDirectory() ? 'tree' : 'blob'
    }));

    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

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

  const transport = new WebSocketClientTransport(url, STAR_WS_TOKEN);
  await server.connect(transport);

  // eslint-disable-next-line no-console
  console.log(`MCP workspace server connected to ${url.host} (run ${RUN_ID})`);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  // eslint-disable-next-line no-console
  console.error(`MCP workspace server failed: ${msg}`);
  process.exitCode = 1;
});
