// Spustí všechny *.test.mjs a sečte výsledky.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const files = readdirSync('test').filter(f => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync('node', ['test/' + f], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n✗ ${failed} test soubor(ů) selhalo` : `\n✓ všechny testy prošly`);
process.exit(failed ? 1 : 0);
