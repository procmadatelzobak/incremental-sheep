import { buildPreviewComment, findExistingPreviewComment, upsertComment } from '../scripts/comment-pr-previews.mjs';

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

{
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const calls = [];
  const warnings = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('/comments?')) return { ok: true, status: 200, json: async () => [] };
    return { ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) };
  };
  console.warn = msg => warnings.push(msg);
  try {
    const result = await upsertComment('owner/repo', 'token', {
      number: 64,
      previewUrl: 'https://procmadatelzobak.github.io/incremental-sheep/pr/64/',
      sha: 'abcdef',
    });
    check('403 při komentování preview URL neshodí deploy krok', result.skipped === true && result.reason === 'forbidden');
    check('403 při komentování preview URL zapíše warning', warnings.some(msg => msg.includes('#64') && msg.includes('403 Forbidden')));
    check('403 test prošel až k vytvoření komentáře', calls.some(call => call.method === 'POST'));
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
}

console.log(`pr-preview-comment: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
