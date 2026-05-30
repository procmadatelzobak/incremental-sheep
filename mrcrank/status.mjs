#!/usr/bin/env node
// Mr. Crank — stavový komentář na issue: in-progress checklist + odkaz na PR.
// Stejný upsert-podle-markeru vzor jako scripts/comment-pr-previews.mjs (#58),
// aby každý běh přepsal jeden stabilní komentář a nezahltil issue.

export const STATUS_MARKER = '<!-- mrcrank:status -->';

// Fáze pracovní smyčky Mr. Cranka (pořadí = postup checklistu).
export const PHASES = [
  { key: 'triage',    label: 'Zařazení issue do fronty' },
  { key: 'goal',      label: 'Definice cíle (mrcrank/goals/<n>.md)' },
  { key: 'tests',     label: 'Akceptační testy (nejdřív červené)' },
  { key: 'implement', label: 'Implementace do zelena' },
  { key: 'verify',    label: 'npm test zelené' },
  { key: 'pr',        label: 'PR připravené k review' },
];

// Cesta k souboru s cílem; čtyřmístné číslo issue ladí s mrcrank/goals/0061.md.
export function goalPath(issue) {
  return `mrcrank/goals/${String(issue).padStart(4, '0')}.md`;
}

// Vykreslí checklist: hotové fáze [x], aktuální s ⏳, zbytek prázdné.
// phase === 'done' označí všechny fáze jako hotové.
export function checklistLines(phase) {
  const done = phase === 'done';
  const idx = PHASES.findIndex(p => p.key === phase);
  return PHASES.map((p, i) => {
    if (done) return `- [x] ${p.label}`;
    if (idx === -1) return `- [ ] ${p.label}`;
    if (i < idx) return `- [x] ${p.label}`;
    if (i === idx) return `- [ ] ⏳ ${p.label}`;
    return `- [ ] ${p.label}`;
  });
}

export function phaseLabel(phase) {
  if (phase === 'done') return 'Hotovo — čeká na review';
  return PHASES.find(p => p.key === phase)?.label ?? phase;
}

// Sestaví tělo stavového komentáře. `state.pr` je { number, url } nebo nic.
export function buildStatusComment(state) {
  const { issue, branch, phase, pr, summary, updatedAt } = state;
  const prLine = pr?.url ? `[#${pr.number}](${pr.url})` : '— (zatím není)';
  const lines = [
    STATUS_MARKER,
    `🐏 **Mr. Crank** — issue #${issue}`,
    '',
    `**Stav:** ${phaseLabel(phase)}`,
    `**Větev:** \`${branch || '—'}\``,
    `**Cíl:** \`${state.goalPath || goalPath(issue)}\``,
    `**PR:** ${prLine}`,
  ];
  if (summary) lines.push('', summary);
  lines.push('', ...checklistLines(phase));
  if (updatedAt) lines.push('', `<sub>Aktualizováno ${updatedAt}</sub>`);
  return lines.join('\n');
}

// Najde existující stavový komentář napříč stránkami (per_page=100).
export async function findExistingStatusComment(fetchCommentsPage) {
  for (let page = 1; ; page++) {
    const comments = await fetchCommentsPage(page);
    const existing = comments.find(comment => (comment.body || '').includes(STATUS_MARKER));
    if (existing) return existing;
    if (comments.length < 100) return null;
  }
}

async function main() {
  const state = JSON.parse(process.env.MRCRANK_STATUS_JSON || '{}');
  if (!state.issue) throw new Error('MRCRANK_STATUS_JSON musí obsahovat alespoň { issue }');

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || typeof fetch !== 'function') {
    throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY a fetch jsou povinné');
  }

  const api = process.env.GITHUB_API_URL || 'https://api.github.com';
  const existing = await findExistingStatusComment(page =>
    github(`${api}/repos/${repo}/issues/${state.issue}/comments?per_page=100&page=${page}`, token));
  const body = buildStatusComment({ updatedAt: new Date().toISOString(), ...state });
  if (existing) {
    await github(`${api}/repos/${repo}/issues/comments/${existing.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  } else {
    await github(`${api}/repos/${repo}/issues/${state.issue}/comments`, token, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }
}

async function github(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API failed: ${res.status} ${res.statusText}`);
  return res.status === 204 ? null : res.json();
}

if (process.argv[1] && process.argv[1].endsWith('status.mjs')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
