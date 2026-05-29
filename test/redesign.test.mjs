// Regrese: popisek populačního chipu je „🐑 Ovce" (s ikonou), takže rozpoznání
// musí být přes podřetězec, ne přesná shoda. Dřív tu bylo === 'Ovce', což se
// kvůli emoji nikdy netrefilo → počet ovcí se četl jako NaN a louka oveček na
// pozadí zůstala navždy prázdná.
import { isSheepChipLabel } from '../src/redesign.js';
import { ICONS } from '../src/icons.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

// přesně tak, jak popisek skládá ui.js (řádek s chipy v HUDu)
check('rozpozná populační chip s ikonou ("🐑 Ovce")', isSheepChipLabel(ICONS.sheep + ' Ovce'));
check('rozpozná i holý popisek "Ovce"', isSheepChipLabel('Ovce'));
check('ignoruje Kredity', !isSheepChipLabel(ICONS.credits + ' Kredity'));
check('ignoruje Vlnu', !isSheepChipLabel(ICONS.wool + ' Vlna/s'));
check('ignoruje Maso', !isSheepChipLabel(ICONS.meat + ' Maso/s'));
check('ignoruje Vědění', !isSheepChipLabel(ICONS.knowledge + ' Vědění'));
check('zvládne prázdný i undefined vstup', !isSheepChipLabel('') && !isSheepChipLabel(undefined));

console.log(`redesign: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
