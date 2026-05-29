# Incremental Sheep

Inkrementální/idle hra o **agregovaném** chovu a šlechtění ovcí. Běží **celá
v prohlížeči** — žádný backend, žádný build. Postup se ukládá do `localStorage`
a dá se exportovat/importovat jako textový string.

Příběh (lore) hry je *Bible Farmářova* ve složce [`lore/`](lore/README.md):
cesta od stříhání pár ovcí přes monopol, nesmrtelnost, vesmír a Dysonovy sféry
až k černé díře a singularitě — a poselství, že **víc ovcí nikdy nestačí**.

## Jak se hraje

- Ovce se **nepočítají jednotlivě** — každé **stádo** je populace s rozložením
  genů `{průměr μ, rozptyl σ}` na každý gen. **Šlechtění** = selekce: usekneš
  nejhorší podíl ve zvoleném genu → μ stoupne a σ se utáhne. Mutace σ doplňuje,
  takže šlechtit lze donekonečna (s klesajícím výnosem).
- Životní cyklus stáda: **dítě → dospělec → starý → smrt stářím**. Vlnu dávají
  dospělí (víc) i staří (míň). **Mléko** dávají samice po prvním oplodnění.
  **Maso a části** vznikají jen z porážky (smrt stářím nedá nic).
- Vlna/mléko/maso se prodávají za **kredity**; za ně kupuješ ovce, vylepšení,
  rozšiřuješ a zahušťuješ pastviny a expanduješ.
- **11 fází** (každá mění pravidla): Stvoření → Množení → Královská (monopol) →
  Nesmrtelnost → Moudré ovce (vesmír) → Exodus (planety, kyslík, sklady) →
  Dysonova sféra → další sféry → Manažer stád → **Černá díra (prestiž reset)** →
  **Singularita** (New Game+). Cíl každé fáze ukazuje nápověda v HUDu.
- Cesta k singularitě je laděná zhruba na **~100 hodin** přes několik
  zrychlujících se černoděrových resetů (přenášejí „Vědění" a perky).

## Spuštění lokálně

```bash
python3 -m http.server 8080
# otevři http://localhost:8080
```

## Testy

```bash
npm test          # node test/all.mjs — bez závislostí
```

- `test/distribution.test.mjs` — matematika selekce (useknutý normál).
- `test/sim.test.mjs` — simulace: růst, prodej, selekce, postup fází, save.
- `test/ui.test.mjs` — klikatelnost tlačítek a vykreslení panelů (DOM stub).
- `test/storage.test.mjs` — sklad: strop per surovina, ořez při zmenšení (#38, #39).
- `test/redesign.test.mjs` — vizuální vrstva: rozpoznání populačního chipu s ikonou.
- `test/integration.test.mjs` — nahrání `main.js` a běh smyčky se stubem prohlížeče.
- `test/balance.test.mjs` — auto-hráč projde hru k singularitě a změří pacing.

## Struktura

- `index.html`, `styles.css` — kostra (dashboard) + plátno jako akcent.
- `src/config.js` — všechny laditelné konstanty (geny, ceny, fáze, perky, balanc).
- `src/sim/` — `distribution.js` (φ/Φ/Φ⁻¹, selekce), `cohort.js` (stárnutí/porody),
  `genetics.js` (rozložení genů), `production.js`, `groups.js`, `simulation.js` (tick).
- `src/econ/` — `economy.js` (ceny/multiplikátory), `storage.js` (sklad/autotrade),
  `processing.js` (Tkalcovny: vlna→sukno, mléko→sýr), `actions.js` (hráčské akce = API pro UI).
- `src/content/` — `phases.js` (11 fází), `locations.js`, `projects.js` (sféra),
  `prestige.js` (černá díra, singularita), `achievements.js` (milníky/Kronika + trvalý násobič).
- `src/io/` — `state.js` (newGame), `save.js` (serialize/offline).
- `src/ui/ui.js` — HUD, záložky, panely. `src/render/canvas.js` — plátno-akcenty.
- `src/icons.js` — centrální mapa ikon (emoji, cíleně u zdrojů/fází/záložek/nákupů).
  `src/redesign.js` — aditivní vizuální vrstva (`--cosmic` dle fáze, particly), bez herní logiky.
- `src/main.js` — bootstrap a herní smyčka. `src/format.js`, `src/rng.js` — pomůcky.
- `REWRITE-SPEC.md` — návrhová specifikace. `MECHANICS.txt` — popis staré verze.

## Nasazení v sinuhetcloud

Repo obsahuje `sinuhetcloud.conf`; manager appku najde scanem, naklonuje a spustí
jako statický web (`python3 -m http.server ${PORT}`).
