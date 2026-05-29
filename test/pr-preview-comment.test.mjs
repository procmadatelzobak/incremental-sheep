import { buildPreviewComment } from '../scripts/comment-pr-previews.mjs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const body = buildPreviewComment({
  number: 51,
  previewUrl: 'https://procmadatelzobak.github.io/incremental-sheep/pr/51/',
  sha: '1234567890abcdef',
});

check('komentář obsahuje stabilní marker', body.includes('<!-- incremental-sheep-preview-url -->'));
check('komentář obsahuje PR preview URL', body.includes('https://procmadatelzobak.github.io/incremental-sheep/pr/51/'));
check('komentář obsahuje zkrácený commit', body.includes('`1234567890ab`'));

console.log(`pr-preview-comment: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
