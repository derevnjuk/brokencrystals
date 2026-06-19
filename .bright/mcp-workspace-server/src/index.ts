import { WebSocketClientTransport } from './ws-transport.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const STAR_WS_URL = process.env.STAR_WS_URL ?? '';
const RUN_ID = process.env.RUN_ID ?? '';
const STAR_WS_TOKEN = process.env.STAR_WS_TOKEN ?? '';
const WORKDIR = process.env.WORKDIR ?? process.cwd();
// Bright API access for scan-lifecycle tools. BRIGHT_TOKEN is the CI-exchanged token
// (distinct from STAR_WS_TOKEN) under which scan creation/polling runs inside the CI MCP
// job; BRIGHT_PROJECT_ID scopes created scans to the project.
const BRIGHT_HOSTNAME = process.env.BRIGHT_HOSTNAME ?? '';
const BRIGHT_TOKEN = process.env.BRIGHT_TOKEN ?? '';
const BRIGHT_PROJECT_ID = process.env.BRIGHT_PROJECT_ID ?? '';
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'vendor'
]);

// log emits one structured JSON line per event to stderr so tool execution is visible in
// the CI job log (stdout is reserved for nothing in particular here, but stderr keeps logs
// clearly separated from any accidental stdout output).
function log(event: string, fields: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      runId: RUN_ID,
      event,
      ...fields
    })
  );
}

const server = new McpServer({
  name: 'star-mcp-workspace',
  version: '0.1.0'
});

// get_file_content mirrors vcs.Client.GetFileContent — returns the full file as text.
server.registerTool(
  'get_file_content',
  {
    description: 'Return the full UTF-8 content of a repository file.',
    inputSchema: {
      path: z.string().min(1).describe('Repository-relative file path.')
    }
  },
  async ({ path: filePath }) => {
    const start = Date.now();
    log('tool.call', { tool: 'get_file_content', path: filePath });
    try {
      const content = await readFile(join(WORKDIR, filePath), 'utf-8');
      log('tool.ok', {
        tool: 'get_file_content',
        path: filePath,
        bytes: content.length,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: content }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'get_file_content',
        path: filePath,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// get_files mirrors vcs.Client.GetFiles — returns the full recursive file tree.
server.registerTool(
  'get_files',
  {
    description:
      'Return the recursive list of repository files as JSON [{path,type}].',
    inputSchema: {}
  },
  async () => {
    const start = Date.now();
    log('tool.call', { tool: 'get_files' });
    try {
      const files: { path: string; type: string }[] = [];
      await walk(WORKDIR, files);
      log('tool.ok', {
        tool: 'get_files',
        count: files.length,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: JSON.stringify(files) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'get_files',
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// get_directory_contents mirrors vcs.Client.GetDirectoryContents — immediate children only.
server.registerTool(
  'get_directory_contents',
  {
    description:
      'Return immediate children of a directory as JSON [{path,type}].',
    inputSchema: {
      path: z
        .string()
        .optional()
        .describe('Directory path relative to repo root.')
    }
  },
  async ({ path: dirPath }) => {
    const start = Date.now();
    const rel = dirPath ?? '.';
    log('tool.call', { tool: 'get_directory_contents', path: rel });
    try {
      const entries = await readdir(join(WORKDIR, rel), {
        withFileTypes: true
      });
      const result = entries.map(e => ({
        path: rel === '.' ? e.name : `${rel}/${e.name}`,
        type: e.isDirectory() ? 'tree' : 'blob'
      }));
      log('tool.ok', {
        tool: 'get_directory_contents',
        path: rel,
        count: result.length,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'get_directory_contents',
        path: rel,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

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
server.registerTool(
  'read_file',
  {
    description:
      'Read a bounded line range from a repository file (1-based offset, limited count).',
    inputSchema: {
      path: z.string().min(1).describe('Repository-relative file path.'),
      offset: z
        .number()
        .int()
        .optional()
        .describe('1-based starting line. Defaults to 1.'),
      limit: z
        .number()
        .int()
        .optional()
        .describe('Max lines to read. Defaults to 50.')
    }
  },
  async ({ path: filePath, offset, limit }) => {
    const start = Date.now();
    const off = offset && offset > 0 ? offset : 1;
    const lim = limit && limit > 0 ? limit : 50;
    log('tool.call', {
      tool: 'read_file',
      path: filePath,
      offset: off,
      limit: lim
    });
    try {
      const content = await readFile(join(WORKDIR, filePath), 'utf-8');
      const lines = splitLines(content).slice(off - 1, off - 1 + lim);
      log('tool.ok', {
        tool: 'read_file',
        path: filePath,
        lines: lines.length,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: JSON.stringify({ lines }) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'read_file',
        path: filePath,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// grep_search runs the match natively on the local file and returns only matching lines
// plus context — never the whole file.
server.registerTool(
  'grep_search',
  {
    description:
      'Search one repository file for a substring or regex; returns matches with context.',
    inputSchema: {
      path: z.string().min(1).describe('Repository-relative file path.'),
      query: z.string().min(1).describe('Substring or regex to search for.'),
      before: z
        .number()
        .int()
        .optional()
        .describe('Context lines before each match. Defaults to 5.'),
      after: z
        .number()
        .int()
        .optional()
        .describe('Context lines after each match. Defaults to 5.'),
      caseSensitive: z.boolean().optional(),
      isRegex: z.boolean().optional()
    }
  },
  async ({ path: filePath, query, before, after, caseSensitive, isRegex }) => {
    const start = Date.now();
    const b = before && before > 0 ? before : 5;
    const a = after && after > 0 ? after : 5;
    log('tool.call', {
      tool: 'grep_search',
      path: filePath,
      query,
      isRegex: isRegex ?? false
    });
    try {
      const lines = splitLines(
        await readFile(join(WORKDIR, filePath), 'utf-8')
      );
      const matcher = buildMatcher(
        query,
        caseSensitive ?? false,
        isRegex ?? false
      );
      const matches: {
        lineNumber: number;
        content: string;
        before: string[];
        after: string[];
      }[] = [];
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

      log('tool.ok', {
        tool: 'grep_search',
        path: filePath,
        count: matches.length,
        ms: Date.now() - start
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ matches, count: matches.length, hasMore })
          }
        ]
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'grep_search',
        path: filePath,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

function buildMatcher(
  query: string,
  caseSensitive: boolean,
  isRegex: boolean
): (line: string) => boolean {
  if (isRegex) {
    const re = new RegExp(query, caseSensitive ? '' : 'i');

    return (line: string): boolean => re.test(line);
  }

  const needle = caseSensitive ? query : query.toLowerCase();

  return (line: string): boolean =>
    (caseSensitive ? line : line.toLowerCase()).includes(needle);
}

// write_file creates or overwrites a file in the local checkout. Combined with the Go-side
// V4A applier, this is how edit_file mutates the workspace (replacing VCS-API commits).
server.registerTool(
  'write_file',
  {
    description:
      'Write (create or overwrite) a repository file with the given UTF-8 content.',
    inputSchema: {
      path: z.string().min(1).describe('Repository-relative file path.'),
      content: z.string().describe('Full new file content.')
    }
  },
  async ({ path: filePath, content }) => {
    const start = Date.now();
    log('tool.call', {
      tool: 'write_file',
      path: filePath,
      bytes: content.length
    });
    try {
      const full = join(WORKDIR, filePath);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, 'utf-8');
      log('tool.ok', {
        tool: 'write_file',
        path: filePath,
        ms: Date.now() - start
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }]
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'write_file',
        path: filePath,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// delete_file removes a file from the local checkout.
server.registerTool(
  'delete_file',
  {
    description: 'Delete a repository file.',
    inputSchema: {
      path: z.string().min(1).describe('Repository-relative file path.')
    }
  },
  async ({ path: filePath }) => {
    const start = Date.now();
    log('tool.call', { tool: 'delete_file', path: filePath });
    try {
      await rm(join(WORKDIR, filePath), { force: true });
      log('tool.ok', {
        tool: 'delete_file',
        path: filePath,
        ms: Date.now() - start
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }]
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'delete_file',
        path: filePath,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// commit_changes stages, commits, and pushes all current changes in the workspace checkout
// to the branch — replacing Star's VCS-API commits. Authentication for the push comes from
// the credentials actions/checkout persists in the runner.
// commit_changes stages, commits, and pushes changes in the workspace checkout to the
// branch — replacing Star's VCS-API commits. It stages only the given paths (the fix's
// files); when none are given it stages tracked modifications only (`git add -u`). Tracked
// files (including the intentionally-committed .bright/ workspace) are committed; untracked
// build artifacts (node_modules, logs, .scip) are never swept in.
server.registerTool(
  'commit_changes',
  {
    description:
      'Commit and push the fix to the branch. Pass the exact repo-relative paths you changed; never commits build artifacts (node_modules, logs).',
    inputSchema: {
      message: z
        .string()
        .min(1)
        .describe('Commit message describing the change.'),
      paths: z
        .array(z.string())
        .optional()
        .describe(
          'Repo-relative paths to commit (the files you edited/added/deleted).'
        )
    }
  },
  async ({ message, paths }) => {
    const start = Date.now();
    log('tool.call', { tool: 'commit_changes', paths: paths?.length ?? 0 });
    try {
      const opts = { cwd: WORKDIR };

      if (paths && paths.length > 0) {
        // Stage exactly the named paths (handles adds, updates, and deletions).
        await execFileAsync('git', ['add', '--', ...paths], opts);
      } else {
        // No explicit paths: stage tracked modifications/deletions only (includes the
        // committed .bright/ workspace) — never untracked artifacts (node_modules, logs, .scip).
        await execFileAsync('git', ['add', '-u'], opts);
      }

      const staged = await execFileAsync(
        'git',
        ['diff', '--cached', '--name-only'],
        opts
      );
      if (staged.stdout.trim() === '') {
        log('tool.ok', {
          tool: 'commit_changes',
          committed: false,
          ms: Date.now() - start
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                committed: false,
                reason: 'no staged changes'
              })
            }
          ]
        };
      }

      await execFileAsync(
        'git',
        [
          '-c',
          'user.email=star@brightsec.com',
          '-c',
          'user.name=Bright Star',
          'commit',
          '-m',
          message
        ],
        opts
      );

      // The remote branch can advance independently of this checkout — Star also commits to it
      // via the VCS API (bootstrap commits, workflow suppression, fallbacks). A plain push then
      // fails non-fast-forward ("fetch first"). Rebase our local commit onto the latest remote
      // and push, retrying once to absorb a concurrent push race.
      const branch = (
        await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts)
      ).stdout.trim();
      let pushed = false;
      for (let attempt = 0; attempt < 2 && !pushed; attempt++) {
        try {
          await execFileAsync('git', ['push'], opts);
          pushed = true;
        } catch {
          // Integrate remote work, then retry. Rebase keeps our commit on top; abort cleanly
          // on conflict so the error surfaces rather than leaving a half-finished rebase.
          try {
            await execFileAsync('git', ['fetch', 'origin', branch], opts);
            await execFileAsync('git', ['rebase', `origin/${branch}`], opts);
          } catch (rebaseErr: unknown) {
            await execFileAsync('git', ['rebase', '--abort'], opts).catch(
              () => undefined
            );
            throw rebaseErr;
          }
        }
      }
      if (!pushed) {
        await execFileAsync('git', ['push'], opts);
      }

      const head = await execFileAsync('git', ['rev-parse', 'HEAD'], opts);
      const sha = head.stdout.trim();
      log('tool.ok', {
        tool: 'commit_changes',
        committed: true,
        sha,
        ms: Date.now() - start
      });

      return {
        content: [
          { type: 'text', text: JSON.stringify({ committed: true, sha }) }
        ]
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'commit_changes',
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// changed_files reports files modified in the working tree vs HEAD, so Star can derive the
// fix's file set after the agent has applied edits via edit_file.
server.registerTool(
  'changed_files',
  {
    description:
      'List files changed in the workspace relative to HEAD as JSON [{path, content}] (content null = deleted).',
    inputSchema: {}
  },
  async () => {
    const start = Date.now();
    log('tool.call', { tool: 'changed_files' });
    try {
      const status = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: WORKDIR
      });
      const files: { path: string; content: string | null }[] = [];

      for (const line of status.stdout.split('\n')) {
        if (line.trim() === '') {
          continue;
        }
        const code = line.slice(0, 2);
        let path = line.slice(3);
        const renameIdx = path.indexOf(' -> ');
        if (renameIdx !== -1) {
          path = path.slice(renameIdx + 4);
        }

        if (code.includes('D')) {
          files.push({ path, content: null });
          continue;
        }
        try {
          files.push({
            path,
            content: await readFile(join(WORKDIR, path), 'utf-8')
          });
        } catch {
          // Unreadable (e.g. submodule); skip.
        }
      }

      log('tool.ok', {
        tool: 'changed_files',
        count: files.length,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: JSON.stringify({ files }) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'changed_files',
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

async function walk(
  dir: string,
  acc: { path: string; type: string }[]
): Promise<void> {
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

// ---------------------------------------------------------------------------
// Scan-lifecycle tools (DAST flow): per decision 1b, scan creation and polling run inside
// the CI MCP job (here) under the already-exchanged BRIGHT_TOKEN, not from Star. Star
// orchestrates by invoking these tools; the Bright API is reached directly with Node's
// global fetch.
// ---------------------------------------------------------------------------

// brightRequest performs an authenticated Bright API call, throwing on non-2xx and
// returning the parsed JSON body (or null for a 204 No Content).
async function brightRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`https://${BRIGHT_HOSTNAME}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${BRIGHT_TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    throw new Error(
      `bright ${method} ${path}: ${res.status} ${await res.text()}`
    );
  }

  return res.status === 204 ? null : await res.json();
}

// create_repeater provisions a Bright repeater via POST /api/v1/repeaters, scoped to
// BRIGHT_PROJECT_ID. The response contains the new repeater { id }, which is then started
// with the start_repeater tool.
server.registerTool(
  'create_repeater',
  {
    description:
      'Create a Bright repeater (POST /api/v1/repeaters) under the CI Bright token; returns the API response JSON containing { id }.',
    inputSchema: {
      name: z.string().min(1).describe('Repeater name.')
    }
  },
  async ({ name }) => {
    const start = Date.now();
    log('tool.call', { tool: 'create_repeater', name });
    try {
      const body: Record<string, unknown> = {
        name,
        projectId: BRIGHT_PROJECT_ID
      };
      const result = await brightRequest('POST', '/api/v1/repeaters', body);
      log('tool.ok', { tool: 'create_repeater', name, ms: Date.now() - start });

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'create_repeater',
        name,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// create_scan creates a Bright scan via POST /api/v1/scans, scoped to BRIGHT_PROJECT_ID.
// The response contains the new scan { id }.
server.registerTool(
  'create_scan',
  {
    description:
      'Create a Bright scan (POST /api/v1/scans) under the CI Bright token; returns the API response JSON containing { id }.',
    inputSchema: {
      name: z.string().min(1).describe('Scan name.'),
      entryPointIds: z
        .array(z.string())
        .optional()
        .describe('Entry point ids to scan.'),
      repeaters: z
        .array(z.string())
        .optional()
        .describe('Repeater ids that relay scan traffic.'),
      tests: z.array(z.string()).optional().describe('Test buckets to run.'),
      discoveryTypes: z
        .array(z.string())
        .optional()
        .describe('Discovery types (e.g. crawler, archive).'),
      module: z.string().optional().describe("Scan module. Defaults to 'dast'.")
    }
  },
  async ({ name, entryPointIds, repeaters, tests, discoveryTypes, module }) => {
    const start = Date.now();
    log('tool.call', { tool: 'create_scan', name });
    try {
      const body: Record<string, unknown> = {
        name,
        projectId: BRIGHT_PROJECT_ID,
        module: module ?? 'dast'
      };
      if (entryPointIds !== undefined) {
        body.entryPointIds = entryPointIds;
      }
      if (repeaters !== undefined) {
        body.repeaters = repeaters;
      }
      if (tests !== undefined) {
        body.tests = tests;
      }
      if (discoveryTypes !== undefined) {
        body.discoveryTypes = discoveryTypes;
      }

      const result = await brightRequest('POST', '/api/v1/scans', body);
      log('tool.ok', { tool: 'create_scan', name, ms: Date.now() - start });

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'create_scan',
        name,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// get_scan fetches a scan's current state via GET /api/v1/scans/{scanId}; the response
// contains at least { id, status }.
server.registerTool(
  'get_scan',
  {
    description:
      'Fetch a Bright scan (GET /api/v1/scans/{scanId}); returns the API response JSON (at least { id, status }).',
    inputSchema: {
      scanId: z.string().min(1).describe('Scan id to fetch.')
    }
  },
  async ({ scanId }) => {
    const start = Date.now();
    log('tool.call', { tool: 'get_scan', scanId });
    try {
      const result = await brightRequest('GET', `/api/v1/scans/${scanId}`);
      log('tool.ok', { tool: 'get_scan', scanId, ms: Date.now() - start });

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'get_scan',
        scanId,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// get_scan_issues fetches the issues (findings) of a scan via
// GET /api/v1/scans/{scanId}/issues; the response is an array of issues.
server.registerTool(
  'get_scan_issues',
  {
    description:
      "Fetch a Bright scan's issues (GET /api/v1/scans/{scanId}/issues); returns the API response JSON array of issues.",
    inputSchema: {
      scanId: z.string().min(1).describe('Scan id whose issues to fetch.')
    }
  },
  async ({ scanId }) => {
    const start = Date.now();
    log('tool.call', { tool: 'get_scan_issues', scanId });
    try {
      const result = await brightRequest(
        'GET',
        `/api/v1/scans/${scanId}/issues`
      );
      log('tool.ok', {
        tool: 'get_scan_issues',
        scanId,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', {
        tool: 'get_scan_issues',
        scanId,
        error: msg,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Long-running process orchestration (DAST flow): the target application and one
// or more Bright repeaters are spawned as detached background children. Unlike
// execFileAsync (which awaits a short-lived command), these processes outlive the
// tool call, so we use child_process.spawn and track them in module-level maps so
// later tool calls — and the SIGTERM teardown — can stop/restart them.
// ---------------------------------------------------------------------------

// backgroundChildren tracks processes spawned detached by the `shell` tool so the
// SIGTERM/SIGINT teardown can terminate them when the CI job ends.
const backgroundChildren = new Set<ChildProcess>();

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// isAlive does a signal-0 liveness probe — no signal is sent, it only checks existence.
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}

// signalGroup targets the child's whole process group first (detached children get their own
// group, so this also reaps grandchildren such as a shell's spawned server), falling back to
// the bare pid if the group send fails.
function signalGroup(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch {
    try {
      process.kill(pid, sig);
    } catch {
      // Already gone.
    }
  }
}

// terminate sends SIGTERM, waits up to ~5s for a graceful exit, then SIGKILLs as a fallback.
async function terminate(pid: number): Promise<void> {
  signalGroup(pid, 'SIGTERM');
  const deadline = Date.now() + 5_000;
  while (isAlive(pid) && Date.now() < deadline) {
    await delay(200);
  }
  if (isAlive(pid)) {
    signalGroup(pid, 'SIGKILL');
  }
}

// shell runs an arbitrary command in the workspace checkout (bash -lc). The caller builds
// the command itself — start the application, run the Bright CLI repeater, probe liveness,
// tail logs, or kill a pid. For long-running processes pass background=true: the command is
// spawned detached, its combined stdout+stderr is written to a per-pid log file, and the
// tool returns { pid, logFile, initialOutput, running } so the caller can manage it with
// follow-up shell calls (tail the logFile, `kill -0 <pid>` to check, `kill <pid>` to stop).
server.registerTool(
  'shell',
  {
    description:
      'Run a shell command in the workspace checkout (bash -lc). Use background=true for long-running processes (app, repeater): the command is spawned detached, its combined stdout+stderr is written to a log file, and the tool returns { pid, logFile, initialOutput, running }. Manage background processes with follow-up shell calls: tail the logFile for logs, `kill -0 <pid>` to check liveness, `kill <pid>` to stop.',
    inputSchema: {
      command: z
        .string()
        .min(1)
        .describe('Bash command line, run from the checkout root (or cwd).'),
      background: z
        .boolean()
        .optional()
        .describe('Spawn detached and return immediately with pid/logFile.'),
      cwd: z
        .string()
        .optional()
        .describe('Working directory relative to the checkout root.'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Foreground command timeout in milliseconds.')
    }
  },
  async ({ command, background, cwd, timeoutMs }) => {
    const start = Date.now();
    const dir = cwd ? join(WORKDIR, cwd) : WORKDIR;
    log('tool.call', { tool: 'shell', background: background === true, cwd });
    try {
      if (background === true) {
        const logsDir = join(WORKDIR, '.bright', 'shell-logs');
        await mkdir(logsDir, { recursive: true });
        const child = spawn('bash', ['-lc', command], {
          cwd: dir,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        const pid = child.pid;
        const logFile = join(logsDir, `${pid}.log`);
        const logStream = createWriteStream(logFile, { flags: 'a' });
        let initialOutput = '';
        const capture = (buf: Buffer): void => {
          logStream.write(buf);
          if (initialOutput.length < 4096) {
            initialOutput += buf.toString('utf-8');
          }
          for (const line of buf.toString('utf-8').split('\n')) {
            if (line.trim() !== '') {
              log('shell.out', { pid, line });
            }
          }
        };
        child.stdout?.on('data', capture);
        child.stderr?.on('data', capture);
        backgroundChildren.add(child);
        child.on('exit', () => backgroundChildren.delete(child));
        child.unref();

        await delay(1500);

        const running = pid !== undefined && isAlive(pid);
        log('tool.ok', {
          tool: 'shell',
          background: true,
          pid,
          running,
          ms: Date.now() - start
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                pid,
                started: true,
                running,
                logFile,
                initialOutput: initialOutput.slice(0, 4096)
              })
            }
          ]
        };
      }

      const result = await new Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
        timedOut: boolean;
      }>((resolve, reject) => {
        const child = spawn('bash', ['-lc', command], { cwd: dir });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let timer: NodeJS.Timeout | undefined;
        if (timeoutMs !== undefined) {
          timer = setTimeout(() => {
            timedOut = true;
            if (child.pid !== undefined) {
              signalGroup(child.pid, 'SIGKILL');
            }
          }, timeoutMs);
        }
        child.stdout?.on('data', (b: Buffer) => {
          stdout += b.toString('utf-8');
        });
        child.stderr?.on('data', (b: Buffer) => {
          stderr += b.toString('utf-8');
        });
        child.once('error', e => {
          if (timer) {
            clearTimeout(timer);
          }
          reject(e);
        });
        child.once('close', code => {
          if (timer) {
            clearTimeout(timer);
          }
          resolve({ stdout, stderr, exitCode: code ?? -1, timedOut });
        });
      });

      log('tool.ok', {
        tool: 'shell',
        exitCode: result.exitCode,
        ms: Date.now() - start
      });

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('tool.error', { tool: 'shell', error: msg, ms: Date.now() - start });

      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);

// teardownChildren best-effort terminates every background process spawned via the shell
// tool so that when the job receives SIGTERM/SIGINT they do not outlive the MCP server.
function teardownChildren(): void {
  for (const child of backgroundChildren) {
    if (child.pid !== undefined) {
      log('shell.teardown', { pid: child.pid });
      signalGroup(child.pid, 'SIGTERM');
    }
  }
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    log('server.shutdown', { signal: sig });
    teardownChildren();
    process.exit(0);
  });
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
