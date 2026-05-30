# Mr. Crank — plán vývoje

Tenhle dokument je „celý plán vývoje" pro agenta Mr. Crank: co už je hotové,
jak se to rozjede ostře a kam to dál růst. Provozní pravidla jsou v
[`../mrcrank.md`](../mrcrank.md), tohle je roadmapa kolem nich.

---

## Fáze 0 — Kit (HOTOVO)

Postaveno podle toho, jak reálně proběhlo první `mrcrank` issue (#61).

- ✅ **#61 splněno** — Pages deploy běží jen z trusted `main` (commit na větvi).
- ✅ `mrcrank.md` — závazný provozní manuál (role Sonnet, meze, cyklus, DoD).
- ✅ `.claude/commands/goal.md` — slash příkaz **`/goal`** (next / `<č>` / `new` / `check`).
- ✅ `mrcrank/status.mjs` — in-progress stavový komentář (checklist + odkaz na PR).
- ✅ `mrcrank/goal.mjs` — evaluator cíle (akceptační checky, exit 0/1).
- ✅ `mrcrank/goals/0061.md` + `TEMPLATE.md` — vzor a šablona cíle.
- ✅ `test/mrcrank-*.test.mjs` — pokrytí obou utilit (auto-discovery).

**Stav:** Mr. Crank se dá hned řídit ručně — pustíš Claude Code se Sonnetem
a napíšeš `/goal`. Fáze 1 jen tohle zautomatizuje.

---

## Fáze 1 — Spuštění (orchestrace)

Cíl: nové `mrcrank` issue se začne řešit bez ručního startu. Tři volby, dají
se kombinovat:

### A) GitHub Action na `issues.labeled`
Workflow se spustí, když někdo přidá štítek `mrcrank`, nastartuje Claude Code
(Sonnet) a zavolá `/goal <číslo>`. Plně automatické, „bere si to samo".

Pozor (lekce z #61): workflow drží jen **minimální práva** a běží z trusted
kontextu. Žádný `pages: write`/`id-token: write`, žádný wildcard trigger.

> **Ready-to-enable** — až bude tajný klíč k dispozici, ulož jako
> `.github/workflows/mrcrank.yml`. Vyžaduje secret pro autentizaci Claude Code
> (např. `ANTHROPIC_API_KEY` nebo OAuth token podle setupu kamaráda).

```yaml
name: Mr. Crank
on:
  issues:
    types: [labeled]
permissions:
  contents: write       # commit + push větve
  issues: write         # stavové komentáře
  pull-requests: write  # otevřít draft PR
concurrency:
  group: mrcrank-${{ github.event.issue.number }}
  cancel-in-progress: false
jobs:
  crank:
    if: github.event.label.name == 'mrcrank'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - name: Run Mr. Crank
        uses: anthropics/claude-code-action@v1   # ověř přesný název/verzi akce
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          model: claude-sonnet-4-6
          # Mr. Crank se řídí mrcrank.md; jen ho navedeme na konkrétní issue:
          prompt: "/goal ${{ github.event.issue.number }}"
```

### B) Plánovač / `/loop`
Periodicky (cron nebo skill `/loop`) zavolat `/goal` (bez čísla → vezme
nejstarší nezpracované). Hodí se jako „uklízeč fronty" doplněk k A).

### C) Ruční (default, funguje teď)
Člověk pustí `/goal`. Nic dalšího netřeba.

**Rozhodnutí k review:** kterou cestou jet (A/B/C) a jaký secret/akci použít —
závisí na prostředí kamarádova repa. Do té doby je C plně funkční.

---

## Fáze 2 — Codex generuje sady testů

Manuál (`mrcrank.md` §4) už počítá s tím, že akceptační testy navrhuje **Codex**
(bývají kvalitnější a je jich dost). Workflow k doladění:

1. Z těla issue Codex vygeneruje `test/<feature>.test.mjs` + `yaml acceptance`
   blok do `mrcrank/goals/<NNNN>.md`.
2. Mr. Crank (Sonnet) je **jen plní do zelena** — testy needituje kvůli
   průchodu (jen je-li test prokazatelně špatně → opraví na záměr issue, jako
   u #61).

Možný budoucí kus: tenký skript/příkaz `mrcrank/scaffold` (volá Codex, založí
goal + kostru testu), ať je krok 1 jedno spuštění.

---

## Fáze 3 — Robustnost a zpětná vazba

- **Reakce na review:** když člověk okomentuje PR, Mr. Crank si komentář
  vezme jako další cíl a opraví (re-run `/goal check`).
- **Limit pokusů:** po N neúspěšných kolech implementace přepnout stav na
  „zaseknuto" + dotaz v issue, místo nekonečného mlácení.
- **Bezpečné meze:** hlídat, že diff zůstává atomický k jednomu issue;
  varovat při sahání mimo rozsah.

---

## Otevřené otázky (k doladění s kamarádem)

1. **Trigger fáze 1:** A (issues.labeled), B (loop), nebo zatím jen C (ručně)?
2. **Autentizace v CI:** `ANTHROPIC_API_KEY` secret, nebo OAuth/Claude GitHub
   App? (Určuje přesný tvar `mrcrank.yml`.)
3. **Verze akce/modelu:** ověřit přesný název Claude Code GitHub akce a
   identifikátor Sonnet modelu platný v jeho prostředí.

Dokud nejsou zodpovězené, Mr. Crank je plně použitelný ručně přes `/goal`.
