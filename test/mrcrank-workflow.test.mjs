import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const workflow = readFileSync('.github/workflows/mrcrank.yml', 'utf8');

// --- spouští se jen z trusted kontextu (lekce z #61) ---
check('Mr. Crank běží na schedule (periodická smyčka)', /on:[\s\S]*schedule:/.test(workflow));
check('Mr. Crank jde spustit ručně přes workflow_dispatch', /workflow_dispatch:/.test(workflow));
check('Mr. Crank se NEspouští na push (žádný untrusted branch trigger, #61)', !/^\s*push:/m.test(workflow));
check('workflow nemá wildcard branch trigger (#61)', !/branches:\s*\[[^\]]*\*\*[^\]]*\]/.test(workflow));

// --- least privilege: jen co agent potřebuje, žádný privileged deploy ---
check('má contents: write (commit + push větve)', /permissions:[\s\S]*contents:\s*write/.test(workflow));
check('má issues: write (stavový komentář)', /permissions:[\s\S]*issues:\s*write/.test(workflow));
check('má pull-requests: write (draft PR)', /permissions:[\s\S]*pull-requests:\s*write/.test(workflow));
check('NEmá pages: write (žádný privileged deploy, #61)', !/pages:\s*write/.test(workflow));
check('NEmá id-token: write (žádný OIDC privileged token, #61)', !/id-token:\s*write/.test(workflow));

// --- autentizace přes OAuth secret, ne natvrdo ---
check('používá Claude Code action', /anthropics\/claude-code-action@/.test(workflow));
check('autentizuje přes OAuth token ze secrets', /claude_code_oauth_token:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN\s*\}\}/.test(workflow));
check('nemá natvrdo zapsaný token/klíč', !/(sk-ant-|ghp_|oauth_token:\s*['"]?[A-Za-z0-9]{20})/.test(workflow));

// --- model je připnutý na Sonnet ---
check('model je připnutý na Sonnet', /--model\s+claude-sonnet-4-6/.test(workflow));

// --- pouští /goal a má strop tahů (náklady) ---
check('pouští příkaz /goal', /prompt:[\s\S]*\/goal/.test(workflow));
check('má strop tahů (--max-turns)', /--max-turns\s+\d+/.test(workflow));

// --- concurrency guard, ať se dva běhy nepoperou ---
check('má concurrency guard', /concurrency:\s*\n\s*group:\s*mrcrank/.test(workflow));

console.log(`mrcrank-workflow: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
