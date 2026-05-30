import { evaluateCheck, evaluateGoal, parseAcceptance, parseGoal, resolveGoalFile } from '../mrcrank/goal.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

// --- parsování goalu ---
const md = `# Issue #61
issue: 61

\`\`\`yaml acceptance
- name: testy projdou
  run: npm test
- name: push jen main
  file: .github/workflows/pages-previews.yml
  must_match: "branches:\\\\s*\\\\[[^\\\\]]*main"
- name: zadny wildcard
  file: .github/workflows/pages-previews.yml
  must_not_match: "branches:\\\\s*\\\\[[^\\\\]]*\\\\*\\\\*"
\`\`\`
`;
const goal = parseGoal(md);
check('parseGoal přečte číslo issue', goal.issue === 61);
check('parseGoal najde tři checky', goal.checks.length === 3);
check('parseGoal načte run check', goal.checks[0].run === 'npm test');
check('parseGoal načte file + must_match', goal.checks[1].file.endsWith('pages-previews.yml') && goal.checks[1].must_match.includes('main'));
check('parseGoal načte must_not_match', goal.checks[2].must_not_match.includes('*'));

check('goal bez acceptance bloku má prázdné checky', parseGoal('issue: 5\nžádný blok').checks.length === 0);
check('parseAcceptance přeskočí komentáře a prázdné řádky', parseAcceptance('# komentar\n\n- name: a\n  run: x').length === 1);

// --- vyhodnocení jednotlivých checků (fake runner + fake fs přes root) ---
const okRun = evaluateCheck({ name: 'r', run: 'cokoliv' }, { runner: () => 0 });
check('run check projde při exit 0', okRun.ok === true);
const badRun = evaluateCheck({ name: 'r', run: 'cokoliv' }, { runner: () => 1 });
check('run check selže při nenulovém exit', badRun.ok === false && badRun.detail === 'exit 1');

// must_match / must_not_match proti reálnému souboru v repu
const root = process.cwd();
const matchOk = evaluateCheck({ name: 'm', file: '.github/workflows/pages-previews.yml', must_match: 'branches:\\s*\\[[^\\]]*main' }, { root });
check('must_match projde na main triggeru', matchOk.ok === true);
const notMatchOk = evaluateCheck({ name: 'n', file: '.github/workflows/pages-previews.yml', must_not_match: "branches:\\s*\\['?\\*\\*" }, { root });
check('must_not_match projde když wildcard chybí', notMatchOk.ok === true);
const missing = evaluateCheck({ name: 'x', file: 'neexistuje.txt', must_match: 'x' }, { root });
check('check na chybějící soubor selže', missing.ok === false && missing.detail.includes('chybí'));
const invalid = evaluateCheck({ name: 'i' }, { root });
check('check bez run/file je neplatný', invalid.ok === false);

// --- agregace ---
const allPass = evaluateGoal({ issue: 1, checks: [{ run: 'a' }, { run: 'b' }] }, { runner: () => 0 });
check('evaluateGoal je passed když všechny projdou', allPass.passed === true && allPass.results.length === 2);
const onePass = evaluateGoal({ issue: 1, checks: [{ run: 'a' }, { run: 'b' }] }, { runner: cmd => (cmd === 'a' ? 0 : 1) });
check('evaluateGoal selže když jeden check selže', onePass.passed === false);
const emptyGoal = evaluateGoal({ issue: 1, checks: [] });
check('prázdný goal není passed (nelze splnit nulou checků)', emptyGoal.passed === false);

// --- resolveGoalFile ---
check('resolveGoalFile zero-paduje číslo', resolveGoalFile('61') === 'mrcrank/goals/0061.md');
check('resolveGoalFile nechá cestu beze změny', resolveGoalFile('mrcrank/goals/custom.md') === 'mrcrank/goals/custom.md');

console.log(`mrcrank-goal: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
