import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const workflow = readFileSync('.github/workflows/pages-previews.yml', 'utf8');

check('Pages workflow běží při pushi do main', /branches:\s*\[[^\]]*\bmain\b[^\]]*\]/.test(workflow));
check('Pages workflow běží při pushi do libovolné branche', /branches:\s*\[[^\]]*['"]\*\*['"][^\]]*\]/.test(workflow));
check('Pages workflow běží při PR submission/update na main', /pull_request_target:\s*\n\s*types:\s*\[[^\]]*\bopened\b[^\]]*\bsynchronize\b[^\]]*\]\s*\n\s*branches:\s*\[[^\]]*\bmain\b[^\]]*\]/.test(workflow));

console.log(`pages-workflow: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
