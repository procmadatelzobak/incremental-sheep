import { allowedPreviewPrs, branchPreviewPath, previewRefspec, prPreviewPath, prPreviewUrl, slugifyBranch } from '../scripts/build-pages-previews.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const prs = [
  { number: 1, state: 'open', base: { ref: 'main' }, author_association: 'COLLABORATOR', title: 'ok', head: { sha: 'a' } },
  { number: 2, state: 'open', base: { ref: 'main' }, author_association: 'NONE', title: 'fork', head: { sha: 'b' } },
  { number: 3, state: 'closed', base: { ref: 'main' }, author_association: 'OWNER', title: 'closed', head: { sha: 'c' } },
  { number: 4, state: 'open', base: { ref: 'dev' }, author_association: 'MEMBER', title: 'wrong base', head: { sha: 'd' } },
];

check('kolaborantská PR na main projdou filtrem', allowedPreviewPrs(prs).map(pr => pr.number).join(',') === '1');
check('PR cesta je deterministická podle čísla', prPreviewPath(49) === 'pr/49');
check('PR preview URL je deterministická', prPreviewUrl(49) === 'https://procmadatelzobak.github.io/incremental-sheep/pr/49/');
check('branch slug je deterministický', slugifyBranch('playtest/balance tuning') === 'playtest-balance-tuning');
check('branch cesta používá slug', branchPreviewPath('preview/foo') === 'branch/preview-foo');
check('refs/heads prefix se při slugování ignoruje', slugifyBranch('refs/heads/playtest/foo') === 'playtest-foo');
check('běžná branch má také preview cestu', branchPreviewPath('fix/foo') === 'branch/fix-foo');
check('preview refspec se smí přepsat při opakovaném buildu', previewRefspec('refs/heads/main', 'refs/previews/branch/main') === '+refs/heads/main:refs/previews/branch/main');

console.log(`pages-preview-build: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
