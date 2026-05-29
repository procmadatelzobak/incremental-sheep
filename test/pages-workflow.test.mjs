import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const workflow = readFileSync('.github/workflows/pages-previews.yml', 'utf8');

check('Pages workflow běží při pushi do main', /branches:\s*\[[^\]]*\bmain\b[^\]]*\]/.test(workflow));
check('Pages workflow nespouští privileged deploy z libovolné branche', !/branches:\s*\[[^\]]*['"]\*\*['"][^\]]*\]/.test(workflow));
check('Pages workflow běží při PR submission/update na main', /pull_request_target:\s*\n\s*types:\s*\[[^\]]*\bopened\b[^\]]*\bsynchronize\b[^\]]*\]\s*\n\s*branches:\s*\[[^\]]*\bmain\b[^\]]*\]/.test(workflow));
check('checkout action používá Node 24 major', workflow.includes('uses: actions/checkout@v6'));
check('upload-pages-artifact action používá Node 24 major', workflow.includes('uses: actions/upload-pages-artifact@v5'));
check('deploy-pages action používá Node 24 major', workflow.includes('uses: actions/deploy-pages@v5'));
check('workflow už nepoužívá Pages actions na Node 20 majoru', !/actions\/(?:checkout@v4|upload-pages-artifact@v3|deploy-pages@v4)/.test(workflow));
check('Pages workflow smí komentovat PR přes issues API', /permissions:\s*\n(?:\s+[a-z-]+:\s+\w+\n)*\s+issues:\s+write\b/s.test(workflow));
check('Pages workflow po deployi spouští komentář preview URL', /Comment PR preview URLs[\s\S]*node scripts\/comment-pr-previews\.mjs/.test(workflow));
check('Pages workflow ukončuje PR preview output delimiter na vlastním řádku', /printf '\\nPR_PREVIEWS_JSON\\n'/.test(workflow));

console.log(`pages-workflow: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
