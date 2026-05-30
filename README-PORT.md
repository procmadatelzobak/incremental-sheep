# Incremental Sheep — redesign port

Přenesení redesignu (teplý pastorální vzhled, zelená + zlatá, proměna louka → vesmír
podle fáze, „šťáva") do tvé **stávající** vanilla kódové základny. Nemění herní
logiku — cílí na třídy, které už `src/ui/ui.js` vykresluje.

## Obsah balíčku
```
styles.css              → nahradí kořenový styles.css (celý vzhled + proměnná --cosmic)
src/redesign.js         → NOVÝ soubor: řídí proměnu fází + přidává particly/pulzy
src/render/canvas.js     → nahradí tvůj render/canvas.js (HEJNO OVCÍ laděné s motivem)
```

## Instalace (3 kroky)

1. **Nahraď** `styles.css` přiloženou verzí.
2. **Zkopíruj** `src/redesign.js` do `src/` a `src/render/canvas.js` přepiš.
3. V `index.html` přidej řádek hned za načtení `main.js`:
   ```html
   <script type="module" src="src/main.js"></script>
   <script type="module" src="src/redesign.js"></script>   <!-- ← přidat -->
   ```

Fonty (Spectral + Hanken Grotesk) se načtou přes `@import` přímo ve `styles.css`,
takže do `index.html` není nutné nic dalšího.

## Jak to funguje
- **Proměna fází:** `redesign.js` čte číslo fáze z HUDu (`#hud-phase`) a nastavuje
  CSS proměnnou `--cosmic` (0 = louka, 1 = vesmír).
- **Čitelnost při přechodu:** obloha (pozadí stránky) se stmívá plynule, ale
  **panely a text se překlápějí rychle a SPOLEČNĚ** v úzkém okně mezi fází 5 a 6
  (proměnná `--ms` v `styles.css`). Díky tomu text ani jeho podklad nikdy
  „neuvíznou" ve stejné šedé — kontrast je čitelný v každé fázi. Zelená + zlatá
  zůstávají konstantní.
- **Šťáva:** delegovaný posluchač na `button.act` → particle burst + pulz; kreditový
  chip pulzuje při změně a u nákupů vyskočí plovoucí „−cena".
- **Plátno:** `canvas.js` kreslí stádo jako **hejno oveček** (chomáčky ovcí na pastvě
  s legendou ♂/♀ a genetickým skóre); čte `--cosmic` a v pozdních fázích se mění na
  noční scénu se svítícími ovcemi pod hvězdami. Počet zobrazených oveček roste s populací.
- **Louka oveček (hračička):** `redesign.js` sleduje počet ovcí (chip „Ovce") a pokaždé,
  když populace stoupne o další ovci, **přikreslí na pozadí jednu jednoduchou ovečku**
  (s drobným „pop" odskokem), až do 1000. Pozice se pamatují v `localStorage`, takže po
  refreshi zůstanou; ovečky se přebarvují podle `--cosmic`, aby byly čitelné na louce
  i ve vesmíru. Vrstva je za UI a neklikatelná. Vyčistit lze smazáním klíče
  `sheep-meadow-v1` v localStorage.

## Volitelné doladění (vyžaduje malou úpravu ui.js)
- **Zlaté CTA tlačítko:** přidej třídu `primary` hlavnímu tlačítku (např. „+ Ovce")
  v `ui.js` — `h('button', { class: 'act primary', ... })` → bude zlaté místo zelené.
- Strukturální zjednodušení z prototypu (hejno-hero, jeden panel „Genom", redukované
  šlechtění) žije v `ui.js`; tenhle port dělá kompletní *restyling* + proměnu + šťávu.
  Když budeš chtít přenést i to, dej vědět — připravím upravený `ui.js`.

## Optimalizace (tato revize)
- **Stejně velká tlačítka:** `.btn-row` je teď mřížka se stejně širokými sloupci,
  takže akční tlačítka mají jednotnou velikost a **nemění šířku** podle délky textu
  (přepínání podtitulku „chybí 💰" ↔ efekt ani měnící se čísla už neposkakují).
- **Chipy v HUDu:** skládají se flexově a každý je široký přesně podle obsahu —
  dlouhé hodnoty (např. „1.2 mld") se **neořezávají**, jen se zalomí na další řádek.
- **Výkon louky oveček:** usazené ovce se kreslí jednou do offscreen bufferu a každý
  snímek se jen „blitne" (1× `drawImage`) + dokreslí se jen ty právě se rodící.
  Z ~1000 detailních kreseb na snímek je tak 1. Buffer se překresluje jen při změně
  stáda / barev / velikosti okna; drahá záře (`shadowBlur`) se nad 240 ovcí vypíná.
- **Genetika — škála nepřetéká:** σ pruh u genu se oříznul do mezí lišty `[μ−σ, μ+σ] ∩ [0,1]`,
  takže při vysokých hodnotách (např. Plodnost μ≫strop, velké σ) už nevyčnívá mimo graf
  (dřív tekl až do 150 % šířky a zasahoval do layoutu). Gen na svém „dobrém" stropu navíc
  dostane zlatý popisek + zvýrazněnou značku μ, ať vysoké hodnoty nesplývají v plné liště.
  *(Pozn.: tahle dvě malá doladění jsou v `src/ui/ui.js` — funkce `geneBar`.)*
- **Přeuspořádání úvodní stránky (`src/ui/ui.js`):** tabulka „co produkuje co a kolik"
  (rozpad příjmů) se přesunula z úvodní záložky **Stáda** do záložky **Staty**; tabulka
  počtů ovcí (samci/samice × děti/dospělí/staří) se přesunula **nahoru do Genetiky**.
  Úvodní stránka tím zůstává čistší (ilustrace + nákup + stav stáda).
- **Ilustrace stáda vyjadřuje postup hry (`src/render/canvas.js`):** krajina pod stádem
  se proměňuje podle fáze — na obzoru postupně přibývají stavby (stodola → větrný mlýn →
  vesnice → továrna → raketa → družice → planety → Dysonův prstenec → černá díra), obloha
  i ovce přecházejí z louky do vesmíru a počet oveček roste s populací. `drawHerd` má nový
  nepovinný parametr `phase` (ui.js ho předává `s.phase`; bez něj se odvodí z `--cosmic`).

## Kompatibilita
- `--cosmic` používá `@property` a `color-mix(in oklch)` — funguje v aktuálních
  Chromium/Safari/Firefox. Ve starších prohlížečích se vzhled degraduje na statickou
  světlou paletu (proměna se prostě neanimuje), hra funguje dál.
