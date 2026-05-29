// Regrese: popisek populačního chipu je „🐑 Ovce" (s ikonou), takže rozpoznání
// musí být přes podřetězec, ne přesná shoda. Dřív tu bylo === 'Ovce', což se
// kvůli emoji nikdy netrefilo → počet ovcí se četl jako NaN a louka oveček na
// pozadí zůstala navždy prázdná.
import { flockSheepScale, isSheepChipLabel, maleDisplayCount } from '../src/redesign.js';
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
check('velikost oveček nezávisí na šířce viewportu', flockSheepScale(360) === flockSheepScale(1920));

// #54: obarvení oveček podle pohlaví — počet černých (samců) drží reálný poměr.
check('půl na půl → polovina samců', maleDisplayCount(100, 50, 50) === 50);
check('poměr 1:3 → čtvrtina samců', maleDisplayCount(100, 25, 75) === 25);
check('žádní samci → 0 černých', maleDisplayCount(100, 0, 200) === 0);
check('žádné samice → vše černé', maleDisplayCount(100, 200, 0) === 100);
check('bez dat (0/0) → 0 černých', maleDisplayCount(100, 0, 0) === 0);
check('nenuloví samci v menšině → aspoň 1 černá', maleDisplayCount(1000, 1, 999999) === 1);
check('nenulové samice v menšině → aspoň 1 bílá', maleDisplayCount(1000, 999999, 1) === 999);
check('jediná zobrazená ovce ukáže většinu (samci)', maleDisplayCount(1, 8, 2) === 1);
check('jediná zobrazená ovce ukáže většinu (samice)', maleDisplayCount(1, 2, 8) === 0);
check('prázdná louka → 0', maleDisplayCount(0, 5, 5) === 0);

console.log(`redesign: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
