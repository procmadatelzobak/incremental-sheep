# Incremental Sheep — specifikace přepisu (podle lore)

> Návrhový dokument pro **kompletní přepis** hry na rozsáhlou idle hru (~100 h)
> odpovídající lore (*Bible Farmářova*, `lore/`). Doplňuje `MECHANICS.txt` (popis
> staré verze). Implementuje se po krocích: **nejdřív vertikální řez, pak fáze
> 2→11** (viz §J). Schváleno uživatelem.

## Kontext

Hra `incremental-sheep` (vanilla JS + Canvas, statický deploy) má dnes funkční
jádro o **jednotlivých** ovcích (do 800 individuálně, nad to agregát). Do repa
přibylo lore — *Bible Farmářova* (`lore/`), 11 fází od stříhání ovcí po Dysonovy
sféry, černou díru a singularitu, + heslovitá osnova `lore/osnova-hry.md`.

Cíl: **přepsat hru od nuly tak, aby odpovídala lore** — velice rozsáhlá idle hra
na **~100 hodin do singularity**. Klíčová změna oproti dnešku: **ovce se počítají
jen agregovaně (sloučeně)**, nikdy ne jednotlivě.

## Zamčená rozhodnutí (potvrzeno uživatelem)

1. **Model ovcí:** skupiny (stáda), každá nese **statistické rozložení genů
   (průměr μ + rozptyl σ na gen)**. Šlechtění a culling posouvají rozložení
   (vyřaď spodních X % v genu → μ nahoru, σ dolů). Genetika zůstává hluboká i
   v miliardách ovcí. (= hlavní dovednostní mechanika.)
2. **Stack:** **vanilla JS, bez buildu** (ES moduly přímo v prohlížeči), statický
   deploy přes `python3 -m http.server` jako dnes.
3. **Vizuál:** **dashboard + lehké plátno-akcenty** — hlavně čísla, lišty, grafy,
   panely/záložky (styl Kittens Game / Universal Paperclips); canvas jen jako
   doplněk (hustotní „blob" stáda, pastviny/sféra jako plnící se ukazatele, ikony
   planet).
4. **Délka/resety:** **~100 h k singularitě**, **víc černoděrových resetů** po
   cestě; každý běh rychlejší díky přenesenému „vědění". Singularita = závěr
   (New Game+ smyčka, viz §E/§J).

## Co znovupoužít z dnešní hry (i při přepisu)

- `src/format.js` — `fmt()` na velká čísla (K/M/B/…/vědecký zápis). **Beze změny.**
- `src/save.js` — vzor serialize→base64, deserialize+hydrate, **offline progres**
  (strop 8 h, po krocích), autosave á 5 s. **Vzor převzít.**
- `src/genetics.js` + `src/config.js` — matematika dědičnosti
  `gen = (a+b)/2 + gauss(0, mutSD)` a definice 8 genů s `[min,max]`, základem, SD,
  mutSD. **Zobecní se na rozložení (μ, σ).**
- `src/economy.js` — exponenciální cenové křivky `cost(n) = base * r^n`. **Vzor.**
- `src/population.js` — koncept kohort `{pohlaví × stádium → počet + průměr genů}`.
  **Rozšíří se o rozptyl σ a o více skupin.**

8 genů jako základ (z `config.js`/`MECHANICS.txt`): fertility, gestation, woolRate,
woolQuality, size, lifespan, childhoodFrac, adultFrac. Přidají se pozdější geny
(milkRate, agingRate, intelligence/brain, …) podle fází.

## Obsahová páteř — 11 fází (z `lore/osnova-hry.md`)

Princip (dle `MECHANICS.txt`, vzor Universal Paperclips): **každá fáze mění
pravidla, ne jen násobí čísla** — přináší nový zdroj nebo mechaniku.

| Fáze | Téma | Co odemyká / přináší |
|---|---|---|
| 1 | Stvoření | stáda, 3 stádia, vlna, maso (z porážky), geny „spící" |
| 2 | Množení | šlechtění+selekce, **mléko** (samice po 1. oplodnění), stroje/automatizace, pastviny, hustota trávníku |
| 3 | Královská | monopol, šponování cen, **výzkum/zpracování** (vlna/mléko/maso → vyšší cena) |
| 4 | Nesmrtelnosti | nápoj z mléka → velký gate, odemyká pokročilou genetiku |
| 5 | Moudrých ovcí | extrémní geny, chytré ovce → **compute**, zpracování částí (kosti/kůže/mozek), let do vesmíru |
| 6 | Exodu | Měsíc/Mars/Jupiter, stanice, **kyslík**, **sklady + autotrade %** (vypnutí, nákup vyprázdní sklad, expanze uvolní sklad) |
| 7 | Sféry | Dysonova sféra, **stavitelé** (rychlost dokončení), start stroje času |
| 8 | Rozmnožení sfér | pastviny na sféře, **laserová raketa** (dosah/rychlost) → další sféry |
| 9 | Soudců | **manažer**: víc skupin/druhů, dělení/slučování, **autoculling**, gen mozku |
| 10 | Černé díry | centrální sklad → **černá díra**, stroj času → **prestiž reset** (přenos „vědění") |
| 11 | Zjevení | po mnoha resetech → max. Touha → **singularita** = konec |

Průřezové motivy do textů/eventů: dva refrény („a přece jich nebylo dosti";
„Touha je nádoba bez dna, a nevedlo to k úspěchu"), eskalace počtu ovcí,
přízviska hrdiny (Farmář → Pastýř → Pán Stád → Ten, Jenž Střihá).

## Technický návrh

**Klíčová inverze oproti dnešku:** hra je **agregovaná od ovce č. 1** (žádný
přechod individuální→agregát). To maže celou jednu kódovou cestu a je to jediný
způsob, jak utáhnout populace v měřítku 100 h.

### A. Datový model

Jeden mutovatelný `state` (float64, časy v herních sekundách). Hlavní části:
`meta` (epiteton, gameTime, totalGameTime), `phase` 1–11 + `flags`, `groups[]`,
`locations[]`, `resources{}`, `rates{}` (transientní), `storage{}`, `upgrades{}`,
`tech{}`, `projects{dyson,laser,timeMachine}`, `prestige{}`, `settings{}`,
`stats{}`. Zamčený zdroj = klíč v `resources` chybí (UI ho skryje, jako dnes gating upgradů).

**`HerdGroup` (jádro):** stádo je *populace*, ne seznam. Na každý gen Gauss `{mu, sigma}`:
```
group = {
  id, name, species, locationId,
  genes: { fertility:{mu,sigma}, gestation:{mu,sigma}, woolRate:{...}, woolQuality,
           size, lifespan, childhoodFrac, adultFrac, /* fáze 5+: milkRate, intelligence */ },
  counts: { M:{child,adult,old}, F:{child,adult,old} },   // spojité (float) počty
  bredFracF,                 // podíl dospělých samic někdy oplodněných → laktace (fáze 2)
  policy: { studGenes, maxMales, killOld, killMaleChildren,
            cull:{ enabled, gene|'breedingScore', cutFrac, stage } },
  _stageDur,                 // cache, přepočet při změně genes.mu
}
```
`Location = {id, kind(meadow…sphere), level, env{light,gravity,oxygenRequired,
woolMult,milkMult,meatMult,birthMult}, density}`. Kapacita = `cap(level, density)`;
porody na lokaci škrtí zbývající headroom (a kyslík, kde `oxygenRequired`).

Volba `{μ,σ}` na gen (ne histogram/vzorky): O(1) paměť, O(genů) update, analyticky
přesné pod Gaussovým předpokladem; μ pohání produkci, selekce zvedá μ a zmenšuje σ.

### B. Agregovaná simulace (jádro, tick = O(skupiny × geny), bez RNG v hot path)

**Stárnutí (kohortový tok, převzato z `population.js`):** z `genes.mu` spočti
`childDur/adultDur/oldDur` (s pravidlem stáří ≥ 10 % života). Tok
`flow(n,d)=min(n, n/d·dt)`; přesypává child→adult→old→smrt. **Smrt stářím nedává maso.**

**Porody + rozložení potomka (zobecnění dědičnosti):**
```
maleCap   = M.adult * (fertility.mu + fertilityBonus)
gestation = gestation.mu * breedingMult
mated     = min(F.adult, maleCap)
births    = min(mated/gestation*dt, headroom*birthCapFactor)   // 50/50 do M/F child
```
Gen potomka = průměr dvou rodičů + mutace ⇒ na úrovni populace:
```
μ_child  = μ_pop
σ_child² = σ_pop²/2 + mutSD²        // průměrování půlí rozptyl, mutace ho přidává
```
Novorozence vmíchej do skupinové distribuce směsí Gaussů (vážené počty):
```
μ'  = (n·μ0 + b·μ_child)/N
σ'² = (n·(σ0²+μ0²) + b·(σ_child²+μ_child²))/N − μ'²        // N=n+b
```
Drží se tak **mutačně-selekční rovnováha** σ (nehroutí se k 0) → šlechtění je „živé" napořád.
**Mléko (fáze 2):** `bredFracF` se ratchetuje k 1; laktující samice `= F.adult·bredFracF`.

**Selekce/culling na úrovni distribuce (hlavní dovednostní mechanika):**
ořezání spodního podílu `p` genu `X~N(μ,σ)` = useknutý normál. S `α=Φ⁻¹(p)`,
`φ(α)`, `λ=φ(α)/(1−Φ(α))` (inverzní Millsův poměr) platí pro ponechanou část:
```
μ' = μ + σ·λ
σ'² = σ²·(1 − λ·(λ−α))          // vždy < σ²  ⇒ rozptyl klesá
```
Pro „nižší je lepší" (gestation) tail obrátit. **Kompozitní breeding-score:**
`Δμ_k = w_k·σ_k·i` (i=λ), σ_k klesá ~`w_k²·λ(λ−α)` (geny nezávislé v v1).
`Φ⁻¹` = Acklamova aproximace, `Φ`/`erf` = Abramowitz-Stegun 7.1.26 (vlastní, bez
knihoven). **Culling jen 1× za `cullPeriod`** (ne každý tick) — jinak numericky
nestabilní; mezi cykly porody doplní tail (σ povyroste), další cyklus usekne →
to je hratelná smyčka. Useknuté ovce → maso/části + úbytek počtů.

**Produkce (z μ a počtů):** vlna `(adults+olds·oldWoolMult)·woolRate.mu·…·dt`,
kvalita `woolQuality.mu·(0.75+childhoodFrac.mu)`; mléko z laktujících; **maso a
části (kosti/kůže/mozek) jen z cullingu**; compute z myslících ovcí
(`intelligence.mu`). Pak konverze na kredity jen pro auto-prodanou část (viz C).

**Stabilita & „napořád zlepšitelné":** σ-floor `≈ sigmaFloorFrac·(max−min)` malý,
ale nenulový, + mutSD ⇒ selekce dává stále klesající, nikdy nulový výnos (μ→cíl
asymptoticky); μ clamp `[min,max]`, kde `max` je **pohyblivá asymptota** (fáze 5 a
perky ji zvedají, aby gen nikdy „nedojel"); počty `max(0,·)`; dt po krocích ≤0,1 s,
≤5000/frame (offline ≤3000); cull jen na hranici cyklu.

### C. Ekonomika & sklady

**Zdroje dle fáze:** credits, wool, meat (1) → milk (2) → cloth/cheese/zpracované
(3) → bones/skin/brain, compute (5) → oxygen, energy (6) → **knowledge** (10, meta).
**Sklad (fáze 6, dle `06-kniha-exodu.md`):** všechny sýpky **sčítají se do jednoho
stropu** (à la Kittens Game). **Autotrade %** na zdroj (`[0..1]` auto-prodej/tick,
zbytek střádá); default 1,0 před odemčením. **Stockpile toggle** = „naučit sýpky
mlčet". **Nákup čehokoli VYPRÁZDNÍ sklad** (tvrdé pravidlo, lore §9) → plný sklad
je jednorázová palivová nádrž, ne pasivní buffer. **Expanze uvolní strop jinde**
(lore §10). Přetečení nad strop = auto-prodej přebytku (anti-softlock).
**Zpracování (fáze 3+):** receptury `{in,out,rate,multiplierVsRaw}`. **Cenové
křivky:** `cost(n)=floor(base·growth^n)` (generický `costOf(spec,level)` nad daty).

### D. Progrese — 11 fází jako pravidla měnící gaty

Princip (`MECHANICS.txt` P1 + Universal Paperclips): **každá fáze mění pravidla,
ne jen násobí čísla.** Tabulka `content/phases.js`:
`phase → {epithet, unlocks[], gate(state)→bool, onEnter(state)}`. Tick kontroluje
gate aktivní fáze; po splnění zvýší `phase`, nastaví flags, spustí `onEnter`
(nový zdroj/lokace/epiteton). Přehled odemčení viz „Obsahová páteř" výše.
**Rozložení ~100 h (1. běh):** fáze 1–5 ~12–18 h (učení systémů), 6–9 ~40–50 h
(expanze), 1. černoděrový reset ~60–80 h kumulativně; další běhy mnohem rychlejší
(viz E) → zbylé ~20–40 h je pár zrychlujících resetů sbíhajících k fázi 11.

### E. Prestiž

**Černá díra (fáze 10):** přesměruj surovou produkci do
`prestige.centralWarehouse`; při ≥ `blackHoleThreshold` lze **zažehnout**
(manuálně, nevratně). **Maže se:** groups, locations, resources (kromě knowledge),
upgrades, tech, projects, `phase→1`, gameTime. **Zůstává:** `knowledge` (+ odměna
škálovaná velikostí běhu), `perks`, `runs++`, `totalGameTime`, lifetime staty.
Knowledge se utrácí za **trvalé perky** (start kredity, globální násobiče, rychlejší
cyklus, vyšší `max` genů od startu, auto-dokončení raných fází…) → každý běh
rychlejší (lore „co kdysi trvalo tisíc let…"). **Singularita (fáze 11):** po dost
resetech metrika „maximální Touhy" odemkne **New Game+ smyčku**: svět se resetuje
s odemčenou Předmluvou a meta-bonusem, hraje se „znovu a líp" (smyčka se uzavírá).

### F. Architektura modulů (vanilla ES moduly, zero-build)

`index.html` načte jen `src/main.js` (`type=module`). Plochý import, žádný bundler,
žádné `node_modules`. Grafy/lišty ručně přes DOM (`ui/widgets.js`).
```
src/
  main.js            bootstrap: load → offline → smyčka (rAF+wall-clock) → render → UI
  config.js          VŠECHNY konstanty: GENES{min,max,base,sd,mut,sigmaFloor,lowerBetter,…},
                     RESOURCES, ECON, COSTS, UPGRADES, TECH, BALANCE, PERKS
  format.js          fmt() — PŘEVZÍT BEZE ZMĚNY
  rng.js             gaussian() (Box-Muller, z genetics.js) + seeded RNG (eventy), clamp()
  sim/
    distribution.js  φ, Φ(erf), Φ⁻¹(Acklam), truncatedNormal()→{μ',σ'}, mixGaussian(), σ-floor  ← MATEMATIKA
    cohort.js        stageBoundaries() [z sheep.js], flow(), aging(), births() (+ směs + bredFrac)
    genetics.js      seedGroupGenes(), applySelection() [truncatedNormal], breedingScore()
    production.js    vlna/mléko/maso/části/compute → přírůstky zdrojů
    groups.js        HerdGroup CRUD: create/split/merge/move (fáze 9), aplikace policy
    simulation.js    step(state,dt): jediný tick (cohort→births→production→cull-cycle→resources→phase-gate)
  econ/
    economy.js       costOf(spec,level) [vzor], multiplikátory
    resources.js     produkce→resources, autotrade split (prodej/sklad), konverze na kredity
    storage.js       kombinovaný strop, autotrade %, stockpile, buy-empties, expanze uvolní
    processing.js    receptury raw→zpracované (fáze 3+)
    upgrades.js      koupě úrovňových upgradů + one-shot tech; spouští buy-empties
  content/
    phases.js        tabulka 11 fází (gate/unlock/onEnter) — pohon progrese
    locations.js     druhy lokací, env modifikátory, kapacita, expanze
    projects.js      Dysonova sféra + stavitelé, laser, stroj času
    prestige.js      zažehnutí černé díry (maže/zachovává), knowledge, perky, singularita
  io/
    save.js          serialize/deserialize/hydrate/saveLocal/applyOffline — VZOR + migrate(verze)
    state.js         newGame() (tvar z §A), defaulty
  ui/
    hud.js, tabs.js, widgets.js
    panels/ herds.js, upgrades.js, stations.js, storage.js, manager.js, prestige.js, stats.js
  render/
    canvas.js        akcenty: hustotní „blob" skupiny, plnící ukazatele pastvin/sféry, ikony planet
```
**Reuse:** `format.js` (1:1), `save.js`+`io` (vzor+migrace), `rng.js`/`sim/genetics.js`
(z `genetics.js`), `sim/cohort.js` (z `population.js`+`sheep.js`), `econ/economy.js` (vzor cen).

### G. Save & offline

Formát jako dnes: `state`→JSON(replacer strhne `_*`,`rates`)→base64. Validace
sentinelem (`'version' in data && 'groups' in data`). `state.version=3`, **bez
migrace v2** (čistý start; starý save se ignoruje/přepíše). **Offline
(převzít `applyOffline`):** `min(8 h, …)`, `step()` po ≤3000 krocích — díky
analytickému O(skupiny) ticku rychlé a přesné při jakékoli populaci; **cull-cykly
musí běžet i offline** (akumulátor `gameTime % cullPeriod` uvnitř `step`).
Autosave 5 s + `beforeunload`/`visibilitychange`.

### H. UI (dashboard-first)

Trvalý **HUD** (zdroje + sazby + fáze + kyslík) · **záložky** (Stáda, Vylepšení,
Stanice, Sklad, Manažer, Prestiž, Staty) — renderuje se jen aktivní panel ·
**canvas akcenty** v panelech (ne celoobrazovková ohrádka). Data flow jednosměrný
jako dnešní `updateUI`: panel si v `init` zapamatuje reference, v `update(state)`
jen přepisuje DOM. **Hvězdný panel = Stáda:** na skupinu lišty genů (μ marker + σ
pruh + min–max track), aby hráč *viděl* selekci utahovat σ a zvedat μ; ovládání
selekce (cílový gen + cutFrac slider + stud + max samců). Stringy česky.

### I. Balancing (na ~100 h)

**Páky (`config.js → BALANCE`):** growth cen (1,15–2,0), `max` genů per fáze,
globální násobiče, cíle projektů, soft-capy kapacit/kyslíku, σ-floor & mutSD
(určují křivku klesajících výnosů šlechtění), `cullPeriod`, perky a per-run zrychlení,
`timeScale`. **Metoda:** cílová křivka času-do-gatu (tabulka D) → nastav cenu gatu
tak, aby při očekávané produkci trval rozpočtený čas; perky lad tak, aby běh N
trval `accel^(N−1)`× běhu 1 (accel ≈ 0,4–0,55), počet resetů ~3–6 → geometrický
ocas sbíhá k singularitě ~100 h. **Nástroj:** nejdřív postavit headless
fast-forward (vysoký `timeScale` + log `milestones[phase]=gameTime`) a doladit.

### J. Rozhodnutí (potvrzeno s uživatelem)

1. **Šlechtění = napořád zlepšitelné.** Žádný tvrdý strop, kde gen „zamrzne".
   σ-floor malý, ale nenulový + mutSD ⇒ selekce dává **stále nějaký, ale klesající
   výnos** (μ se k cíli blíží asymptoticky). Per-gen `max` = pohyblivá asymptota,
   kterou fáze 5 (extrémní geny) a perky zvedají, aby μ prakticky nikdy nenarazil.
2. **Konec = New Game+ smyčka.** Po dosažení singularity se svět resetuje
   s **odemčenou Předmluvou** a meta-bonusem, hraje se „znovu a líp" (dle lore).
   Žádná tvrdá tečka.
3. **Postup pro `/goal` = vertikální řez, pak po fázích.** Nejdřív hratelné jádro
   end-to-end (viz níže), pak přidávat fáze přes tabulku `content/phases.js`.
4. **Stávající save = čistý start.** Model se mění od základu; žádná migrace v2,
   nová hra začíná na nule (starý localStorage klíč se ignoruje/přepíše).

**Vertikální řez (1. milník pro `/goal`):** agregovaný tick (cohort + porody +
selekce) · 1 lokace · zdroje vlna/maso/kredity · panel Stáda s lištami μ/σ a
ovládáním selekce · zjednodušený sklad + autotrade · 1 stub černoděrového resetu ·
save/offline · headless fast-forward na ladění. Teprve pak fáze 2→11 a vizuál.

### K. Rizika

σ-collapse stabilita (clamp `p∈[0;0,9]`, σ-floor, cull jen na hranici cyklu);
aproximace „jedna distribuce na skupinu" (děti/dospělí/staří sdílí rozložení —
přijmout, případně povýšit na per-stádium 3× čísla); výkon UI při mnoha skupinách
(virtualizace seznamu, jen aktivní panel); 100 h je empirické (fast-forward
harness první); rozsah (stavět vertikální řez dřív než šířku); float64 nad ~9e15
ztrácí celočíselnou přesnost u *počtů* (kosmetické, idle konvence).

## Ověření

Hra je statická, spouští se lokálně:
```
python3 -m http.server 8080      # otevřít http://localhost:8080
```
1. **Jádro (vertikální řez):** koupit první stádo → vidět růst počtů po stádiích,
   plynulou vlnu a maso jen z cullingu; zapnout selekci na `woolRate` a sledovat,
   jak μ stoupá a σ se utahuje (lišty v panelu Stáda) — ověřuje agreg. genetiku.
2. **Mléko:** ověřit, že mléko teče až po oplodnění samic (`bredFracF`>0).
3. **Sklady/autotrade (fáze 6):** vypnout autotrade → zdroj se střádá ke společnému
   stropu; koupit upgrade → sklad se vyprázdní; expanze → strop vzroste.
4. **Projekty:** Dysonova sféra plní ukazatel rychleji s víc staviteli; laser
   zrychluje další sféry.
5. **Prestiž:** naplnit centrální sklad → zažehnout černou díru → reset smaže běh,
   zachová knowledge/perky; další běh je prokazatelně rychlejší (log `milestones`).
6. **Offline:** zavřít a otevřít po čase → banner s výdělkem; selekce proběhla i
   offline (μ se posunulo). Strop 8 h.
7. **Save:** export→import stringu obnoví stav; `version=3`, čistý start bez migrace.
8. **Deploy:** `sinuhetcloud.conf` beze změny (statický web, `python3 -m http.server`).
9. **Balancing:** headless fast-forward (vysoký `timeScale`) projde fáze a vypíše
   časy milníků; doladit ke ~100 h.
