import { buildPreviewComment, findExistingPreviewComment } from '../scripts/comment-pr-previews.mjs';

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

{
  let pages = 0;
  const found = await findExistingPreviewComment(async page => {
    pages = page;
    if (page === 1) return Array.from({ length: 100 }, (_, id) => ({ id, body: 'běžný komentář' }));
    return [{ id: 123, body: '<!-- incremental-sheep-preview-url -->\nstarý preview komentář' }];
  });
  check('lookup existujícího markeru stránkuje za prvních 100 komentářů', found && found.id === 123 && pages === 2);
}

{
  let pages = 0;
  const found = await findExistingPreviewComment(async page => {
    pages = page;
    return page === 1 ? Array.from({ length: 100 }, (_, id) => ({ id, body: 'běžný komentář' })) : [];
  });
  check('lookup skončí až po poslední stránce bez markeru', found === null && pages === 2);
}

console.log(`pr-preview-comment: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
