#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist/pages');
const APP_ENTRIES = ['index.html', 'styles.css', 'src'];
const ALLOWED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const PREVIEW_REMOTE = process.env.PREVIEW_REMOTE || 'origin';

export function slugifyBranch(name) {
  return String(name || '').replace(/^refs\/heads\//, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'branch';
}

export function prPreviewPath(number) {
  return `pr/${number}`;
}

export function branchPreviewPath(name) {
  return `branch/${slugifyBranch(name)}`;
}

export function allowedPreviewPrs(prs, base = 'main') {
  return prs.filter(pr => pr && pr.state === 'open' && pr.base?.ref === base && ALLOWED_ASSOCIATIONS.has(pr.author_association));
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, '.nojekyll'), '');

  const previews = [];
  await copyAppFromDir(ROOT, OUT);

  for (const pr of allowedPreviewPrs(await loadOpenPulls())) {
    const dest = path.join(OUT, prPreviewPath(pr.number));
    const ref = `refs/previews/pr-${pr.number}`;
    fetchRef(`pull/${pr.number}/head`, ref);
    await copyAppFromGitRef(ref, dest);
    previews.push({
      kind: 'PR',
      label: `#${pr.number} ${pr.title}`,
      path: `${prPreviewPath(pr.number)}/`,
      sha: pr.head.sha,
      url: pr.html_url,
    });
  }

  for (const branch of listPreviewBranches()) {
    const slug = slugifyBranch(branch.name);
    const dest = path.join(OUT, 'branch', slug);
    const ref = `refs/previews/branch/${slug}`;
    fetchRef(`refs/heads/${branch.name}`, ref);
    await copyAppFromGitRef(ref, dest);
    previews.push({
      kind: 'Branch',
      label: branch.name,
      path: `branch/${slug}/`,
      sha: branch.sha,
      url: `https://github.com/${process.env.GITHUB_REPOSITORY || 'procmadatelzobak/incremental-sheep'}/tree/${branch.name}`,
    });
  }

  await writePreviewIndex(previews);
}

async function copyAppFromDir(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of APP_ENTRIES) {
    await cp(path.join(from, entry), path.join(to, entry), { recursive: true });
  }
  await applyStorageNamespaceOverlay(to);
}

async function copyAppFromGitRef(ref, dest) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'incremental-sheep-preview-'));
  try {
    const archive = spawnSync('git', ['archive', ref], { cwd: ROOT, encoding: null });
    if (archive.status !== 0) throw new Error((archive.stderr || Buffer.from('git archive failed')).toString());
    const tar = spawnSync('tar', ['-x', '-C', tmp], { input: archive.stdout, encoding: null });
    if (tar.status !== 0) throw new Error((tar.stderr || Buffer.from('tar failed')).toString());
    await copyAppFromDir(tmp, dest);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function loadOpenPulls() {
  if (process.env.PREVIEW_PULLS_JSON) return JSON.parse(process.env.PREVIEW_PULLS_JSON);
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || typeof fetch !== 'function') return [];

  const api = process.env.GITHUB_API_URL || 'https://api.github.com';
  const pulls = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${api}/repos/${repo}/pulls?state=open&per_page=100&page=${page}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`GitHub API pull request list failed: ${res.status} ${res.statusText}`);
    const batch = await res.json();
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  return pulls;
}

function listPreviewBranches() {
  const out = git(['ls-remote', '--heads', PREVIEW_REMOTE]);
  return out.split('\n').filter(Boolean).map(line => {
    const [sha, ref] = line.split(/\s+/);
    return { sha, name: ref.replace(/^refs\/heads\//, '') };
  });
}

function fetchRef(remoteRef, localRef) {
  git(['fetch', '--depth=1', PREVIEW_REMOTE, `${remoteRef}:${localRef}`]);
}

async function applyStorageNamespaceOverlay(appDir) {
  const storageHelper = path.join(appDir, 'src/io/storage-key.js');
  await mkdir(path.dirname(storageHelper), { recursive: true });
  await cp(path.join(ROOT, 'src/io/storage-key.js'), storageHelper);

  const configPath = path.join(appDir, 'src/config.js');
  let config = await readFile(configPath, 'utf8');
  if (!config.includes("from './io/storage-key.js'")) {
    config = config.replace(
      'export const VERSION = 3;\n',
      "import { storageKey } from './io/storage-key.js';\n\nexport const VERSION = 3;\n",
    );
  }
  config = config.replace(
    /export const SAVE_KEY = 'incremental-sheep-v3';/,
    "export const SAVE_KEY_BASE = 'incremental-sheep-v3';\nexport const SAVE_KEY = storageKey(SAVE_KEY_BASE);",
  );
  await writeFile(configPath, config);

  const redesignPath = path.join(appDir, 'src/redesign.js');
  let redesign = await readFile(redesignPath, 'utf8');
  if (!redesign.includes("from './io/storage-key.js'")) {
    redesign = redesign.replace(
      '// ===========================================================================\n\n',
      "// ===========================================================================\nimport { storageKey } from './io/storage-key.js';\n\n",
    );
  }
  redesign = redesign.replace(
    /const FLOCK_KEY = 'sheep-meadow-v1';/,
    "const FLOCK_KEY = storageKey('sheep-meadow-v1');",
  );
  await writeFile(redesignPath, redesign);
}

async function writePreviewIndex(previews) {
  const rows = previews.sort((a, b) => a.path.localeCompare(b.path)).map(p => `
      <tr>
        <td>${escapeHtml(p.kind)}</td>
        <td><a href="../${escapeHtml(p.path)}">${escapeHtml(p.label)}</a></td>
        <td><code>${escapeHtml((p.sha || '').slice(0, 12))}</code></td>
        <td><a href="${escapeHtml(p.url)}">GitHub</a></td>
      </tr>`).join('');
  await mkdir(path.join(OUT, 'previews'), { recursive: true });
  await writeFile(path.join(OUT, 'previews/index.html'), `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Incremental Sheep previews</title>
  <style>
    body { font: 16px system-ui, sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
    code { font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Incremental Sheep previews</h1>
  <p><a href="../">Produkce</a></p>
  <table>
    <thead><tr><th>Typ</th><th>Preview</th><th>Commit</th><th>Zdroj</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">Žádné preview není dostupné.</td></tr>'}</tbody>
  </table>
</body>
</html>
`);
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
