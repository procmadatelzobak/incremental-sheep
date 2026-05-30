#!/usr/bin/env node
// Mr. Crank — vyhodnocení cíle (goalu) issue.
//
// Cíl je strojově ověřitelný kontrakt. Žije v mrcrank/goals/<NNNN>.md jako
// Markdown s frontmatter-like hlavičkou a blokem ```yaml acceptance```:
//
//   # Issue #61 — Pages deploy jen z trusted main
//   issue: 61
//   ```yaml acceptance
//   - name: testy projdou
//     run: npm test
//   - name: push trigger jen main
//     file: .github/workflows/pages-previews.yml
//     must_match: "push:\\s*\\n\\s*branches:\\s*\\[[^\\]]*\\bmain\\b"
//   - name: žádný wildcard push
//     file: .github/workflows/pages-previews.yml
//     must_not_match: "branches:\\s*\\[[^\\]]*\\*\\*"
//   ```
//
// Každá položka acceptance je jedna z:
//   run: <shell>            — projde, když příkaz skončí exit 0
//   file + must_match       — projde, když soubor matchuje regex
//   file + must_not_match   — projde, když soubor regex NEmatchuje
//
// `node mrcrank/goal.mjs <issue|cesta>` vypíše verdikt a skončí 0/1.
// Smyčka Mr. Cranka iteruje, dokud neskončí 0.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function parseGoal(markdown) {
  const issueMatch = markdown.match(/^\s*issue:\s*#?(\d+)\s*$/m);
  const issue = issueMatch ? Number(issueMatch[1]) : null;

  const block = markdown.match(/```ya?ml\s+acceptance\s*\n([\s\S]*?)```/);
  if (!block) return { issue, checks: [] };

  return { issue, checks: parseAcceptance(block[1]) };
}

// Záměrně minimalistický parser pro list "- name: ... \n key: value" položek;
// hodnoty smí být v uvozovkách (regexy s mezerami / escapy). Bez yaml závislosti
// — repo je "bez buildu, bez závislostí".
export function parseAcceptance(yaml) {
  const checks = [];
  let current = null;
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s*-\s+(\w+):\s*(.*)$/);
    const cont = line.match(/^\s+(\w+):\s*(.*)$/);
    if (item) {
      if (current) checks.push(current);
      current = {};
      current[item[1]] = unquote(item[2]);
    } else if (cont && current) {
      current[cont[1]] = unquote(cont[2]);
    }
  }
  if (current) checks.push(current);
  return checks;
}

function unquote(value) {
  const v = value.trim();
  // Hodnoty bývají regex zdroje (must_match/must_not_match) → předáváme je do
  // new RegExp doslova, jen sundáme obalující uvozovky a unescapujeme \" / \'.
  // Backslashe (\s, \n, \[, …) NEpřekládáme — to dělá až RegExp.
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"');
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/\\'/g, "'");
  return v;
}

export function evaluateCheck(check, { root = process.cwd(), runner = defaultRunner } = {}) {
  const name = check.name || check.run || check.file || 'check';
  if (check.run) {
    const code = runner(check.run, root);
    return { name, ok: code === 0, detail: code === 0 ? 'exit 0' : `exit ${code}` };
  }
  if (check.file && (check.must_match || check.must_not_match)) {
    const filePath = path.join(root, check.file);
    if (!existsSync(filePath)) return { name, ok: false, detail: `soubor chybí: ${check.file}` };
    const content = readFileSync(filePath, 'utf8');
    if (check.must_match) {
      const ok = new RegExp(check.must_match).test(content);
      return { name, ok, detail: ok ? 'match' : `nematchuje /${check.must_match}/` };
    }
    const ok = !new RegExp(check.must_not_match).test(content);
    return { name, ok, detail: ok ? 'no-match' : `nechtěně matchuje /${check.must_not_match}/` };
  }
  return { name, ok: false, detail: 'neplatný check (chybí run nebo file+must_(not_)match)' };
}

export function evaluateGoal(goal, opts = {}) {
  const results = goal.checks.map(c => evaluateCheck(c, opts));
  return { issue: goal.issue, results, passed: results.length > 0 && results.every(r => r.ok) };
}

function defaultRunner(cmd, root) {
  const res = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' });
  return res.status == null ? 1 : res.status;
}

export function resolveGoalFile(arg) {
  if (/^\d+$/.test(arg)) return `mrcrank/goals/${arg.padStart(4, '0')}.md`;
  return arg;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Použití: node mrcrank/goal.mjs <číslo-issue|cesta-k-goalu>');
    process.exit(2);
  }
  const file = resolveGoalFile(arg);
  if (!existsSync(file)) {
    console.error(`Goal soubor neexistuje: ${file}`);
    process.exit(2);
  }
  const goal = parseGoal(readFileSync(file, 'utf8'));
  if (!goal.checks.length) {
    console.error(`Goal ${file} nemá žádné acceptance checky — nelze vyhodnotit.`);
    process.exit(2);
  }
  console.log(`\n🐏 Mr. Crank — vyhodnocení cíle ${file} (issue #${goal.issue ?? '?'})\n`);
  const { results, passed } = evaluateGoal(goal);
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail}`);
  console.log(passed ? '\n✓ Cíl splněn.\n' : '\n✗ Cíl zatím nesplněn.\n');
  process.exit(passed ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('goal.mjs')) main();
