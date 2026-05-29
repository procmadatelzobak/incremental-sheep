import { previewSlotFromPath, storageKey } from '../src/io/storage-key.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

check('produkční root nemá preview slot', previewSlotFromPath('/incremental-sheep/') === '');
check('PR preview má deterministický slot', previewSlotFromPath('/incremental-sheep/pr/49/') === 'pr-49');
check('branch preview má deterministický slot', previewSlotFromPath('/incremental-sheep/branch/playtest-balance/') === 'branch-playtest-balance');
check('produkční save key zůstává původní', storageKey('incremental-sheep-v3', '/incremental-sheep/') === 'incremental-sheep-v3');
check('PR save key je oddělený', storageKey('incremental-sheep-v3', '/incremental-sheep/pr/49/') === 'incremental-sheep-v3@pr-49');
check('branch save key je oddělený', storageKey('sheep-meadow-v1', '/incremental-sheep/branch/foo/') === 'sheep-meadow-v1@branch-foo');

console.log(`storage-key: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
