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

## Fáze 1 — Spuštění (orchestrace) — HOTOVO

Zvolená cesta: **periodická smyčka přes `schedule`** + **autentizace přes
Claude GitHub App / OAuth**. Živý workflow: `.github/workflows/mrcrank.yml`.

- Cron `0 */6 * * *` (každých 6 h) + ruční `workflow_dispatch` (volitelně s
  číslem issue). Schedule i dispatch běží **z `main`** → trusted kontext, takže
  privilegovaný běh nejde nastartovat z untrusted větve (lekce z #61).
- **Least privilege:** `contents/issues/pull-requests: write`. Žádná práva na
  deploy Pages ani OIDC token.
- Model připnutý na `claude-sonnet-4-6`, strop `--max-turns` kvůli nákladům.
- Prompt: prázdný běh → `/goal` (nejstarší issue ve frontě), dispatch s
  číslem → `/goal <č>`.
- Invariantu hlídá `test/mrcrank-workflow.test.mjs` (stejná filozofie jako
  `pages-workflow` test: bezpečnostní vlastnosti workflow jsou testované).

### Co musí kamarád donastavit (jednorázově)

Workflow je **inertní**, dokud nejsou splněné dvě věci — do té doby jen spadne
na auth kroku, nic nerozbije:

1. Nainstalovat **Claude GitHub App** (`https://github.com/apps/claude`, příp.
   přes `/install-github-app` z Claude Code).
2. Vygenerovat OAuth token (`claude setup-token`) a uložit ho jako repo secret
   **`CLAUDE_CODE_OAUTH_TOKEN`**.

### Alternativy (kdyby se hodily později)

- **Reakce na štítek hned** (`issues.labeled`) místo cronu — rychlejší odezva,
  ale spouští se z event kontextu; držet stejně minimální práva.
- **Ruční default** — člověk prostě napíše `/goal`. Funguje bez čehokoli z výše.

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

## Rozhodnutí (zafixováno)

1. **Trigger:** periodická smyčka (`schedule` + `workflow_dispatch`). ✅
2. **Autentizace:** Claude GitHub App / OAuth (`CLAUDE_CODE_OAUTH_TOKEN`). ✅
3. **Akce/model:** `anthropics/claude-code-action@v1`, `claude-sonnet-4-6`. ✅

Zbývá jen jednorázové nastavení appky + secretu (viz Fáze 1). Do té doby je
Mr. Crank plně použitelný i ručně přes `/goal`.
