import { installDom, buttonsByText, allButtons } from './dom-stub.mjs';
const { document } = installDom();
const { initUI, updateUI, notifyPhase, notifyAchievement, showOfflineModal } = await import('../src/ui/ui.js');
import { newGame } from '../src/io/state.js';
import { totalCount } from '../src/sim/cohort.js';
import { serialize, deserialize } from '../src/io/save.js';
import { UPGRADES, UPGRADE_TIER_FROM, upgradeName } from '../src/config.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

const panel = () => document.getElementById('panel');
const hud = () => document.getElementById('hud');
const tabs = () => document.getElementById('tabs');
function clickTab(label) { const b = buttonsByText(tabs(), label)[0]; if (b) b.click(); }

// --- bootstrap UI ---
const s = newGame();
s.resources.credits = 1e7;     // ať jsou tlačítka dostupná
initUI(s, 'app', () => {});

check('HUD vykreslen', !!hud() && hud().textContent.includes('Farmář'));
check('Nápověda cíle je vidět', hud().textContent.includes('›'));
check('Panel má obsah', panel().children.length > 0);
check('Existují záložky', allButtons(tabs()).length >= 3);

// --- klik na "+ Ovce" zvýší populaci a sníží kredity ---
{
  const pop0 = totalCount(s.groups[0]);
  const cr0 = s.resources.credits;
  const b = buttonsByText(panel(), 'Koupit ovce')[0];
  check('tlačítko +Ovce existuje', !!b);
  b.click();
  check('+Ovce zvýší populaci', totalCount(s.groups[0]) > pop0);
  check('+Ovce sníží kredity', s.resources.credits < cr0);
}

// --- nákup ovcí: volba pohlaví a množství (#7) ---
{
  clickTab('Stáda');
  const fBtn = buttonsByText(panel(), 'Samice')[0];
  check('volba Samice existuje', !!fBtn);
  if (fBtn) fBtn.click();
  check('volba nastaví pohlaví F', s.settings.buy.sex === 'F');
  const q10 = buttonsByText(panel(), '×10')[0];
  if (q10) q10.click();
  check('volba množství ×10', s.settings.buy.qty === 10);
  const m0 = s.groups[0].counts.M.adult, f0 = s.groups[0].counts.F.adult;
  buttonsByText(panel(), 'Koupit ovce')[0].click();
  check('koupě samic přidá jen samice', s.groups[0].counts.F.adult > f0 && s.groups[0].counts.M.adult === m0);
}

// --- nákup vylepšení ---
{
  clickTab('Vylepšení');
  const b = buttonsByText(panel(), 'Koupit')[0];
  check('tlačítko Koupit existuje', !!b);
  const lvlsBefore = JSON.stringify(s.upgrades);
  b.click();
  check('nákup vylepšení změní úroveň', JSON.stringify(s.upgrades) !== lvlsBefore);
}

// --- rozšíření lokace ---
{
  s.phase = 2;   // Pozemky se odemykají od fáze 2 (#14)
  initUI(s, 'app', () => {});
  clickTab('Pozemky');
  const b = buttonsByText(panel(), 'Zahrada')[0];
  check('tlačítko koupě území existuje', !!b);
  const n0 = s.land.worlds.earth.counts[0] || 0;
  if (b) b.click();
  check('koupě území přidá parcelu', (s.land.worlds.earth.counts[0] || 0) === n0 + 1);
}

// --- všechny dostupné záložky se vykreslí a tlačítka jdou klikat bez chyby ---
{
  const labels = ['Stáda', 'Vylepšení', 'Pozemky', 'Staty'];
  let ok = true;
  for (const L of labels) {
    try {
      clickTab(L);
      check(`panel '${L}' má obsah`, panel().children.length > 0);
      // klikni na všechna povolená tlačítka (smoke test, bez pádu)
      for (const b of allButtons(panel())) { if (!b.disabled) b.click(); }
    } catch (e) { ok = false; console.error('  chyba v', L, e.message); }
  }
  check('proklik tlačítek bez výjimky', ok);
  check('žádné NaN kredity po proklikání', isFinite(s.resources.credits));
}

// --- updateUI nespadne ---
{
  let ok = true;
  try { for (let i = 0; i < 5; i++) updateUI(s, true); } catch (e) { ok = false; console.error(e); }
  check('updateUI(full) běží bez chyby', ok);
}

// --- pozdější fáze: panely se vykreslí (manuálně nastavená fáze) ---
{
  const s2 = newGame();
  s2.resources.credits = 1e9;
  s2.phase = 10; s2.flags.storage = true; s2.flags.manager = true; s2.flags.blackHole = true;
  s2.world.ceilingMult = 3;
  initUI(s2, 'app', () => {});
  let ok = true;
  for (const L of ['Stáda', 'Sklad', 'Manažer', 'Prestiž', 'Pozemky']) {
    try { clickTab(L); for (const b of allButtons(panel())) { if (!b.disabled) b.click(); } }
    catch (e) { ok = false; console.error('  chyba v fázi 10', L, e.message); }
  }
  check('pozdní fáze: panely bez chyby', ok);
}

// --- oprava blikání: bez strukturální změny se panel NEPŘEKRESLUJE ---
{
  const s3 = newGame();
  s3.resources.credits = 1e6;
  initUI(s3, 'app', () => {});
  const btnBefore = buttonsByText(panel(), 'Koupit ovce')[0];
  const wrapBefore = panel().children[0];
  // simuluj 20 frejmů, kde se mění jen čísla (kredity, rychlosti), ne struktura
  for (let i = 0; i < 20; i++) { s3.resources.credits += 1000; s3.rates = { wool: 5, meat: 1, _pop: 20 }; updateUI(s3); }
  const btnAfter = buttonsByText(panel(), 'Koupit ovce')[0];
  check('panel se nepřekresluje bez strukturální změny (= žádné blikání)', btnBefore && btnBefore === btnAfter);
  check('struktura panelu zůstává stejná', wrapBefore === panel().children[0]);
  // při strukturální změně se panel překreslí
  s3.phase = 2; updateUI(s3); clickTab('Pozemky');
  const before = panel().children[0];
  s3.land.density += 1;
  updateUI(s3);
  check('panel se překreslí při strukturální změně', before !== panel().children[0]);
}

// --- regrese: starý save (bez settings.autobuy) se načte a UI nespadne ---
{
  const old = newGame();
  delete old.settings.autobuy;          // save z doby před autobuyerem
  const loaded = deserialize(serialize(old));
  check('hydrate doplní chybějící settings.autobuy', !!loaded.settings.autobuy);
  let ok = true;
  try {
    loaded.resources.credits = 1e6; loaded.phase = 2;   // Pozemky od fáze 2
    initUI(loaded, 'app', () => {});
    for (const L of ['Stáda', 'Vylepšení', 'Pozemky']) { clickTab(L); updateUI(loaded); }
  } catch (e) { ok = false; console.error('  pád UI na starém save:', e.message); }
  check('UI se starým save nespadne (zamrznutí opraveno)', ok);
}

// --- Kronika + událost fáze + toast milníku (nesmí spadnout) ---
{
  const s = newGame();
  s.resources.credits = 1e6; s.phase = 2;       // Kronika od fáze 2
  s.achievements = { sheep10: 1, phase2: 1 };   // něco odemčeno
  initUI(s, 'app', () => {});
  clickTab('Kronika');
  check('Kronika se vykreslí', panel().children.length > 0 && panel().textContent.includes('Milníky'));
  let ok = true;
  try { notifyPhase(2); notifyAchievement('sheep10'); updateUI(s); } catch (e) { ok = false; console.error('  notifikace spadly:', e.message); }
  check('modál fáze + toast milníku nespadnou', ok);
  check('HUD má nástroj rady (💡)', buttonsByText(document.getElementById('hud'), '💡').length > 0);
}

// --- Batch B: šlechtící presety (#30: v záložce Genetika) + náhled prestige ---
{
  const s = newGame(); s.resources.credits = 1e6; s.phase = 2;
  initUI(s, 'app', () => {});
  clickTab('Genetika');
  const vlna = buttonsByText(panel(), 'Vlna')[0];
  check('preset Vlna existuje (v Genetice)', !!vlna);
  if (vlna) vlna.click();
  check('preset nastaví selekci na woolRate', s.groups[0].policy.cull.gene === 'woolRate' && s.groups[0].policy.cull.enabled);
  check('Genetika obsahuje geny + výběr při narození', panel().textContent.includes('Geny stáda') && panel().textContent.includes('Výběr při narození') && panel().textContent.includes('Přísnost výběru'));
  clickTab('Stáda');
  check('genom a šlechtění už nejsou na dashboardu Stáda (#30)', !panel().textContent.includes('Výběr při narození') && !panel().textContent.includes('Geny stáda'));
  check('Porážka už není na Stádech (přesun do Jatek #33)', !panel().textContent.includes('Porážet'));

  const sp = newGame(); sp.phase = 7; sp.resources.credits = 1e6;
  initUI(sp, 'app', () => {});
  let ok = true;
  try { clickTab('Prestiž'); } catch (e) { ok = false; console.error(e); }
  check('náhled prestige (fáze 7) se vykreslí', ok && panel().textContent.includes('Černá díra'));
}

// --- Batch C: offline návratová obrazovka ---
{
  const s = newGame();
  initUI(s, 'app', () => {});
  let ok = true;
  try { showOfflineModal({ seconds: 600, credits: 1234, wool: 50, milk: 0, meat: 5, popDelta: 10 }, s); } catch (e) { ok = false; console.error(e); }
  check('offline modal nespadne', ok);
}

// --- #10/#12/#16: tlačítka ukazují efekt / důvod nedostupnosti ---
{
  const s = newGame(); s.resources.credits = 0;
  initUI(s, 'app', () => {});
  clickTab('Vylepšení');
  const b = buttonsByText(panel(), 'Koupit')[0];
  check('nedostupné tlačítko ukazuje „chybí"', !!b && b.textContent.includes('chybí'));
  s.resources.credits = 1e6; updateUI(s);
  check('dostupné tlačítko ukazuje efekt (%)', buttonsByText(panel(), 'Koupit')[0].textContent.includes('%'));
}

// --- #14: méně záložek na začátku, víc jak hra roste ---
{
  const a = newGame(); initUI(a, 'app', () => {});
  const vis1 = allButtons(tabs()).filter(b => b.style.display !== 'none').length;
  const b = newGame(); b.phase = 9; initUI(b, 'app', () => {});
  const vis9 = allButtons(tabs()).filter(x => x.style.display !== 'none').length;
  check('fáze 1 má méně záložek než fáze 9', vis1 < vis9);
}

// --- #8: Laboratoř se odemkne s pozemky kolem města (Země tier 4) ---
{
  const a = newGame(); a.phase = 3; a.resources.credits = 1e7;
  initUI(a, 'app', () => {});
  const labHidden = !allButtons(tabs()).some(b => b.textContent.includes('Laboratoř') && b.style.display !== 'none');
  check('Laboratoř skrytá bez městských pozemků', labHidden);

  const b = newGame(); b.phase = 3; b.resources.credits = 1e7;
  b.land.worlds.earth.tier = 4;
  initUI(b, 'app', () => {});
  const labVisible = allButtons(tabs()).some(x => x.textContent.includes('Laboratoř') && x.style.display !== 'none');
  check('Laboratoř viditelná s pozemky kolem města', labVisible);
  clickTab('Vylepšení');
  check('lab upgrade (Dojička) NENÍ ve Vylepšení po odemčení laboratoře', !panel().textContent.includes('Dojička'));
  clickTab('Laboratoř');
  check('Laboratoř obsahuje pokročilé upgrady', panel().textContent.includes('Dojička') && panel().textContent.includes('Tkalcovny'));
  let ok = true;
  try { for (const bn of allButtons(panel())) { if (!bn.disabled) bn.click(); } } catch (e) { ok = false; console.error(e); }
  check('proklik Laboratoře bez chyby', ok);
}

// --- #11: karty zdrojů ukazují trend (+kr/s, růst stáda /min) ---
{
  const s = newGame(); s.resources.credits = 1000;
  initUI(s, 'app', () => {});
  s.rates = { _income: 48, _popGrowth: 0.2, _pop: totalCount(s.groups[0]) };
  updateUI(s);
  check('karta kreditů ukazuje příjem /s', hud().textContent.includes('+48') && hud().textContent.includes('/s'));
  check('karta ovcí ukazuje růst /min', hud().textContent.includes('/min'));
}

// --- #17: ukazatel naplnění pastvin na dashboardu (HUD) ---
{
  const s = newGame(); s.resources.credits = 1e6;
  initUI(s, 'app', () => {});
  const bars = hud().querySelectorAll('.bar');
  check('HUD má ukazatel naplnění pastvin', bars.length >= 1);
  check('ukazatel ukazuje počet ovcí / kapacitu', hud().textContent.includes('Pastviny') && hud().textContent.includes('/'));
  const fill = hud().querySelector('.cap-fill');
  check('výplň ukazatele má nenulovou šířku (funguje)', !!fill && parseFloat(fill.style.width) > 0);
  s.groups[0].counts.F.adult = 1e6;     // přeplň → ~100 %
  updateUI(s);
  check('ukazatel reaguje na zaplnění (≈100 %)', parseFloat(fill.style.width) > 90);
}

// --- #22/#28: počty samců/samic po stádiích + vysvětlení limitu samců ---
{
  const s = newGame(); s.resources.credits = 1e6; s.phase = 2;
  s.groups[0].counts.M.adult = 3; s.groups[0].counts.F.adult = 5000;
  initUI(s, 'app', () => {});
  clickTab('Stáda');
  check('panel ukazuje rozpad samci/samice', panel().textContent.includes('Samci') && panel().textContent.includes('Samice') && panel().textContent.includes('Dospělí'));
  check('panel ukazuje řádek páření', panel().textContent.includes('Páření'));
  check('málo samců → varování', panel().textContent.includes('málo samců'));
  // poměr samic/samec se nově řeší v Jatkách (#33): vysoký poměr varuje, že brzdí porody
  const sj = newGame(); sj.resources.credits = 1e6; sj.phase = 3; sj.land.worlds.earth.tier = 4;
  sj.groups[0].counts.F.adult = 100; sj.groups[0].counts.M.adult = 100;
  sj.groups[0].policy.autoMales = true; sj.groups[0].policy.femalesPerMale = 50;   // >> plodnost → brzdí porody
  initUI(sj, 'app', () => {}); clickTab('Jatka');
  check('vysoký poměr samic/samec v Jatkách varuje, že brzdí porody', panel().textContent.includes('porody klesnou'));
}

// --- #29: signál „trh ovcí se vyčerpává" když množení předstihne nákup ---
{
  const s = newGame(); s.resources.credits = 1e6; s.buys.addSheep = 12;   // drahý nákup
  initUI(s, 'app', () => {});
  s.rates = { _popGrowth: 2, _pop: 4 };     // stádo roste rychle množením
  updateUI(s);
  clickTab('Stáda');
  check('signál vyčerpaného trhu se zobrazí', panel().textContent.includes('Trh ovcí se vyčerpává'));
}

// --- #36 (reopened): UI neposkakuje — rezervovaná výška + vyhlazený růst ---
{
  const s = newGame(); s.resources.credits = 1e6;
  initUI(s, 'app', () => {});
  clickTab('Stáda');
  // hlášky s proměnlivou délkou (limit stáda, páření) mají rezervovanou výšku
  check('stavové řádky mají .statusline (rezervovaná výška)', panel().querySelectorAll('.statusline').length >= 2);
}
{
  // tržní hláška čte VYHLAZENÝ růst: když je vyhlazený 0, surový kmit nahoru ji nezapne
  const s = newGame(); s.resources.credits = 1e6; s.buys.addSheep = 12;
  initUI(s, 'app', () => {});
  s.rates = { _popGrowthAvg: 0, _popGrowth: 2, _pop: 4 };   // surový kmit, vyhlazený klid
  updateUI(s); clickTab('Stáda');
  check('vyhlazený růst 0 → hláška NEbliká, i když surový kmitne', !panel().textContent.includes('Trh ovcí se vyčerpává'));
  s.rates = { _popGrowthAvg: 2, _pop: 4 };                  // vyhlazený růst skutečný
  updateUI(s); clickTab('Stáda');
  check('vyhlazený růst > 0 → hláška se zobrazí', panel().textContent.includes('Trh ovcí se vyčerpává'));
}

// --- #24: rozpad příjmů v panelu Stáda ---
{
  const s = newGame(); s.resources.credits = 1e6;
  s.rates = { wool: 10, _income: 12, _pop: 4 };
  initUI(s, 'app', () => {});
  clickTab('Stáda');
  check('panel ukazuje rozpad příjmů', panel().textContent.includes('Příjem kreditů') && panel().textContent.includes('Celkem'));
  check('rozpad ukazuje vlnu v kr/s', panel().textContent.includes('kr/s'));
}

// --- #23: Laboratoř vysvětluje zpracování a ukazuje sukno/sýr ---
{
  const s = newGame(); s.phase = 3; s.resources.credits = 1e7;
  s.land.worlds.earth.tier = 4;        // odemkne Laboratoř
  s.rates = { cloth: 5, cheese: 2, _pop: 4 };
  initUI(s, 'app', () => {});
  clickTab('Laboratoř');
  check('Laboratoř má sekci Zpracování', panel().textContent.includes('Zpracování'));
  check('Zpracování ukazuje sukno i sýr', panel().textContent.includes('Sukno') && panel().textContent.includes('Sýr'));
  s.upgrades.looms = 2; initUI(s, 'app', () => {}); clickTab('Laboratoř');
  check('s Tkalcovnami hlásí % zpracování', panel().textContent.includes('%'));
}

// --- #21: počty ovcí jsou celá čísla (žádné desetinné) ---
{
  const s = newGame(); s.resources.credits = 1e6;
  s.groups[0].counts.F.adult = 3.7; s.groups[0].counts.M.adult = 2.2;
  initUI(s, 'app', () => {});
  clickTab('Stáda');
  const txt = panel().textContent;
  // v sekci přehledu stáda nesmí být "3.7" ani "2.2"
  check('počty ovcí jsou zaokrouhlené (#21)', !txt.includes('3.7') && !txt.includes('2.2'));
}

// --- #26: HUD ukazuje progress lištu k další fázi ---
{
  const s = newGame(); s.resources.credits = 1e6; s.stats.credLifetime = 750;  // půl cesty do fáze 2 (1500)
  initUI(s, 'app', () => {});
  check('HUD má lištu postupu k fázi', !!hud().querySelector('.gate-fill'));
  check('lišta postupu ukazuje fázi → fázi', hud().textContent.includes('Fáze 1→2'));
  const gf = hud().querySelector('.gate-fill');
  check('lišta postupu je ~v půlce (50 %)', parseFloat(gf.style.width) > 40 && parseFloat(gf.style.width) < 60);
}

// --- #27: filtr vylepšení (Vše/Dostupné/Brzy/Zakoupené) ---
{
  const s = newGame(); s.resources.credits = 80;   // jen na nejlevnější (Nůžky 60)
  initUI(s, 'app', () => {});
  clickTab('Vylepšení');
  check('panel má filtr vylepšení', buttonsByText(panel(), 'Dostupné').length > 0 && buttonsByText(panel(), 'Zakoupené').length > 0);
  const total = buttonsByText(panel(), 'Koupit').length;
  buttonsByText(panel(), 'Dostupné')[0].click();
  const avail = buttonsByText(panel(), 'Koupit').length;
  check('filtr Dostupné ukáže méně položek než Vše', avail < total && avail >= 1);
  buttonsByText(panel(), 'Zakoupené')[0].click();
  check('filtr Zakoupené (nic koupeno) → prázdné', buttonsByText(panel(), 'Koupit').length === 0);
}

// --- #25: delta bublina po nákupu ---
{
  const s = newGame(); s.resources.credits = 1e6;
  initUI(s, 'app', () => {});
  clickTab('Vylepšení');
  buttonsByText(panel(), 'Koupit')[0].click();
  const d = hud().querySelector('.chip-d');
  check('po nákupu se ukáže delta kreditů', !!d && d.textContent.includes('−'));
}

// --- #32: horní nástroje (💡 rada/tip, ⚙ nastavení export/import, ❓ o hře) ---
{
  const s = newGame(); s.resources.credits = 1e6;
  const hooks = { exportSave: () => 'SAVESTRING123', importSave: () => {}, resetGame: () => {} };
  initUI(s, 'app', () => {}, hooks);
  const tipBtn = buttonsByText(hud(), '💡')[0];
  const gearBtn = buttonsByText(hud(), '⚙')[0];
  const infoBtn = buttonsByText(hud(), '❓')[0];
  check('HUD má tři nástroje (💡 ⚙ ❓)', !!tipBtn && !!gearBtn && !!infoBtn);
  tipBtn.click();
  const m1 = document.body.querySelector('.modal');
  check('💡 otevře radu s doporučeným krokem a tipem', !!m1 && m1.textContent.includes('➤') && m1.textContent.includes('Tip'));
  document.body.querySelector('.modal-x').click();
  check('× zavře modál', !document.body.querySelector('.modal'));
  gearBtn.click();
  const m2 = document.body.querySelector('.modal');
  check('⚙ otevře nastavení (export i načtení)', !!m2 && m2.textContent.includes('Export') && m2.textContent.includes('Načíst'));
  buttonsByText(m2, 'Export')[0].click();
  const field = m2.querySelector('input');
  check('Export naplní pole save stringem', !!field && field.value === 'SAVESTRING123');
  document.body.querySelector('.modal-x').click();
  infoBtn.click();
  check('❓ otevře „O hře" s autorem a GitHubem', document.body.textContent.includes('O hře') && document.body.textContent.includes('GitHub'));
  document.body.querySelector('.modal-x').click();
}

// --- #33: Jatka — odemčení městskými pozemky + dvě automatiky porážek ---
{
  const a = newGame(); a.phase = 3; a.resources.credits = 1e7;
  initUI(a, 'app', () => {});
  check('Jatka skrytá bez městských pozemků', !allButtons(tabs()).some(b => b.textContent.includes('Jatka') && b.style.display !== 'none'));

  const s = newGame(); s.phase = 3; s.resources.credits = 1e7; s.land.worlds.earth.tier = 4;
  initUI(s, 'app', () => {});
  check('Jatka viditelná s městskými pozemky', allButtons(tabs()).some(b => b.textContent.includes('Jatka') && b.style.display !== 'none'));
  clickTab('Jatka');
  check('Jatka má obě automatiky vedle sebe', panel().textContent.includes('Samic na 1 samce') && panel().textContent.includes('před zestárnutím') && panel().querySelectorAll('.jatka-cols').length === 1);
  const checks = panel().querySelectorAll('input').filter(i => i.attributes.type === 'checkbox');
  checks[0].dispatch('change');
  check('zapnutí porážky samců nastaví policy.autoMales', s.groups[0].policy.autoMales === true);
  checks[1].dispatch('change');
  check('zapnutí porážky před zestárnutím nastaví policy.slaughterBeforeOld', s.groups[0].policy.slaughterBeforeOld === true);
}

// --- #34: odznak „!" u nově odemčené záložky (persist v state.seenTabs) ---
{
  const s = newGame(); initUI(s, 'app', () => {});
  check('startovní záložka (Genetika) nemá odznak', buttonsByText(tabs(), 'Genetika')[0].querySelectorAll('.tab-badge').length === 0);
  s.phase = 2; updateUI(s);     // odemkne Pozemky + Kroniku
  const poz = buttonsByText(tabs(), 'Pozemky')[0];
  check('nově odemčená záložka má odznak !', !!poz && poz.querySelectorAll('.tab-badge').length === 1);
  poz.click();
  check('po otevření je záložka „viděná" (state.seenTabs)', s.seenTabs.stations === true);
  check('odznak po otevření zmizí', buttonsByText(tabs(), 'Pozemky')[0].querySelectorAll('.tab-badge').length === 0);
}

// --- #43: nákup ovcí je collapsible od fáze 5 (a inline před ní) ---
{
  const s1 = newGame(); s1.phase = 1;
  initUI(s1, 'app', () => {});
  check('phase 1: nákup ovcí inline (žádný buy-collapse)', !panel().querySelector('.buy-collapse'));

  const s5 = newGame(); s5.phase = 5;
  initUI(s5, 'app', () => {});
  const det = panel().querySelector('.buy-collapse');
  check('phase 5: nákup ovcí je v collapsible bloku', !!det && det.tagName === 'DETAILS');
  check('phase 5: collapsible má summary se slovem rozbalit', det && (det.textContent || '').includes('rozbalit'));
}

// --- #10: doporučené tlačítko (suggestedAction) dostane class 'primary' ---
{
  // Stáda: addSheep je nejlevnější useful nákup ve fázi 1, takže buyBtn = primary
  const sA = newGame(); sA.phase = 1; sA.resources.credits = 1e9;
  initUI(sA, 'app', () => {});
  const buyBtnEl = buttonsByText(panel(), 'Koupit ovce')[0];
  check('#10 Stáda: Koupit ovce má class primary (cheapest useful)', !!buyBtnEl && (buyBtnEl.className || '').split(' ').includes('primary'));

  // Vylepšení: po vyšroubování ceny ovcí (vysoké s.buys.addSheep) se primárním stane nejlevnější upgrade
  const sB = newGame(); sB.phase = 1; sB.resources.credits = 1e9; sB.buys.addSheep = 30;   // sheep cost přes 1e6
  initUI(sB, 'app', () => {});
  clickTab('Vylepšení');
  check('#10 Vylepšení: alespoň jedno upgrade tlačítko má primary', panel().querySelectorAll('.primary').length >= 1);
}

// --- #35: oznámení nové fáze je inline karta na začátku panelu (NE modal) ---
{
  const s = newGame(); s.resources.credits = 1e6; s.phase = 2;
  initUI(s, 'app', () => {});
  notifyPhase(2);
  check('oznámení fáze NENÍ modální okno', !document.body.querySelector('.modal-bg'));
  check('oznámení fáze JE inline v panelu', panel().querySelectorAll('.phase-banner').length === 1);
  check('inline karta ukazuje název fáze', panel().querySelector('.phase-banner').textContent.includes('Množení'));
  buttonsByText(panel().querySelector('.phase-banner'), 'Pokračovat')[0].click();
  check('Pokračovat zavře inline kartu', panel().querySelectorAll('.phase-banner').length === 0);
}

// --- per-úrovňové názvy vylepšení (kosmetická eskalace, beze změny mechaniky) ---
{
  const u = UPGRADES.shears;
  check('název: úroveň 0 = tiers[0]', upgradeName(u, 0) === 'Nůžky');
  check('název: úroveň 1 = tiers[0]', upgradeName(u, 1) === 'Nůžky');
  check('název: úroveň 2 se mění (Průmyslové nůžky)', upgradeName(u, 2) === 'Průmyslové nůžky');
  check('název: úroveň 3 (Automatická holírna)', upgradeName(u, 3) === 'Automatická holírna');
  check('název: úrovně 1–30 mají každá vlastní název', upgradeName(u, 4) !== upgradeName(u, 3) && upgradeName(u, 4) === u.tiers[3]);
  check('název: v ocasu se sousední úrovně sdílejí (L50 == L55)', upgradeName(u, 50) === upgradeName(u, 55));
  check('název: vysoká úroveň se ustálí na posledním', upgradeName(u, 9999) === u.tiers[u.tiers.length - 1]);
  // invarianty napříč všemi vylepšeními
  let okBase = true, okLen = true;
  for (const k in UPGRADES) {
    if (UPGRADES[k].tiers[0] !== UPGRADES[k].label) okBase = false;
    if (UPGRADES[k].tiers.length !== UPGRADE_TIER_FROM.length) okLen = false;
  }
  check('každé vylepšení: tiers[0] == label (zachová identitu i save)', okBase);
  check('každé vylepšení: počet názvů == počet prahů', okLen);

  // UI: povýšené vylepšení ukazuje honosnější název, ne základní
  const s = newGame(); s.resources.credits = 1e7; s.upgrades.shears = 2;
  initUI(s, 'app', () => {});
  clickTab('Vylepšení');
  const txt = panel().textContent;
  check('UI: povýšené Nůžky ukazují „Průmyslové nůžky"', txt.includes('Průmyslové nůžky'));
  check('UI: tlačítko láká na další název („Automatická holírna")', txt.includes('Automatická holírna'));
  check('UI: základní „Nůžky" se u povýšeného nezobrazuje', !txt.includes('Nůžky'));
}

console.log(`ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
