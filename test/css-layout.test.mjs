import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const css = readFileSync('styles.css', 'utf8');

check('root rezervuje stabilní scrollbar gutter', /html\s*\{[^}]*scrollbar-gutter:\s*stable\s+both-edges\s*;/s.test(css));
check('starší prohlížeče mají fallback se stálým vertikálním scrollbarem', /@supports\s+not\s*\(\s*scrollbar-gutter:\s*stable\s*\)\s*\{[^}]*html\s*\{[^}]*overflow-y:\s*scroll\s*;/s.test(css));

console.log(`css-layout: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
