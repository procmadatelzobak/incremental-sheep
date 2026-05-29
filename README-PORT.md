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

## Kompatibilita
- `--cosmic` používá `@property` a `color-mix(in oklch)` — funguje v aktuálních
  Chromium/Safari/Firefox. Ve starších prohlížečích se vzhled degraduje na statickou
  světlou paletu (proměna se prostě neanimuje), hra funguje dál.
