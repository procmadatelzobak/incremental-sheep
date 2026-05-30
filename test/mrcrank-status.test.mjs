import { STATUS_MARKER, PHASES, buildStatusComment, checklistLines, findExistingStatusComment, goalPath, phaseLabel } from '../mrcrank/status.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

// --- cesta k cíli ladí s mrcrank/goals/0061.md ---
check('goalPath zero-paduje číslo issue na 4 místa', goalPath(61) === 'mrcrank/goals/0061.md');
check('goalPath nechá delší číslo beze změny', goalPath(1234) === 'mrcrank/goals/1234.md');

// --- checklist: hotové / aktuální / čekající ---
const tests = checklistLines('tests'); // index 2
check('checklist označí předchozí fáze jako hotové', tests[0].startsWith('- [x]') && tests[1].startsWith('- [x]'));
check('checklist označí aktuální fázi jako probíhající (⏳, ne hotovou)', tests[2].includes('⏳') && !tests[2].includes('[x]'));
check('checklist nechá budoucí fáze prázdné', tests[3].startsWith('- [ ]') && !tests[3].includes('⏳'));
check('checklist má řádek pro každou fázi', tests.length === PHASES.length);

const done = checklistLines('done');
check('fáze done odškrtne všechny položky', done.every(l => l.startsWith('- [x]')) && !done.some(l => l.includes('⏳')));

check('phaseLabel zná lidský popis fáze i sentinel done', phaseLabel('pr') === 'PR připravené k review' && phaseLabel('done').includes('review'));

// --- tělo komentáře ---
const withPr = buildStatusComment({
  issue: 61,
  branch: 'mrcrank/issue-61-pages-trigger',
  phase: 'pr',
  pr: { number: 99, url: 'https://github.com/procmadatelzobak/incremental-sheep/pull/99' },
  summary: 'Omezuje push trigger na main.',
});
check('komentář obsahuje stabilní marker', withPr.includes(STATUS_MARKER));
check('komentář obsahuje číslo issue', withPr.includes('#61'));
check('komentář obsahuje větev', withPr.includes('mrcrank/issue-61-pages-trigger'));
check('komentář odkazuje na cíl', withPr.includes('mrcrank/goals/0061.md'));
check('komentář odkazuje na PR když existuje', withPr.includes('/pull/99'));
check('komentář obsahuje shrnutí', withPr.includes('Omezuje push trigger na main.'));

const noPr = buildStatusComment({ issue: 61, branch: 'b', phase: 'goal' });
check('komentář bez PR ukáže placeholder', noPr.includes('**PR:** — (zatím není)'));

// --- upsert lookup stránkuje stejně jako preview komentář (#58) ---
{
  let pages = 0;
  const found = await findExistingStatusComment(async page => {
    pages = page;
    if (page === 1) return Array.from({ length: 100 }, (_, id) => ({ id, body: 'běžný komentář' }));
    return [{ id: 7, body: `${STATUS_MARKER}\nstarý stav` }];
  });
  check('lookup stavu stránkuje za prvních 100 komentářů', found && found.id === 7 && pages === 2);
}
{
  const found = await findExistingStatusComment(async () => []);
  check('lookup vrátí null když marker nikde není', found === null);
}

console.log(`mrcrank-status: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
