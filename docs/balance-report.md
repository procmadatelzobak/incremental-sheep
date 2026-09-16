# Progression redesign: measured results

Implemented for [issue #74](https://github.com/procmadatelzobak/incremental-sheep/issues/74).
Measurements: 2026-09-16. These are automated simulations, not a declaration that human play is balanced.

## Diagnosis

The previous auto-player reached singularity in **40.1 hours**, with a first black hole at **12.9 hours** and effectively no phase 9. Its permissive timing assertion passed. Density purchases cost approximately **0.014 seconds of income entering phase 5**, falling to **0.00012 seconds entering phase 8** in the recorded diagnostic. Those measurements describe the old policy, not a controlled comparison under the new visit schedule.

Raw capacity was priced roughly as `a × addedCapacity × tierGrowth`. With a full pasture producing `N × q × productionMultipliers × priceMultipliers`, the marginal payback was approximately `a × tierGrowth / (q × multipliers)`. Improving each sheep, processing, prices, achievements, immortality and prestige compounded together; cost per added sheep did not follow them. Tier changes restarted parcel growth. Merely raising the coefficient would postpone the same feedback loop.

Lifetime-credit gates rewarded the same loop repeatedly. Compute lacked an effective progression sink; Dyson construction lacked physical recipes; the Judges had no substantial coordination task. The old test's frequent actions were also more capable than the production offline scheduler.

## Architecture and decisions

- **Local herds and support:** each herd belongs to one world. Births share that world's headroom fairly. From Exodus onward, effective capacity is `min(rawCapacity, installedSupport / sizeDemand)`. Larger sheep need more support. Colony charters establish an affordable first foothold, but an empty planet supplies no workers. Support upgrades require credits, materials and construction.
- **Staffed work plus real materials:** each phase has a visible project and recipe. A world's workforce saturates at 1,000 adults. Above that point, more sheep supply commodities but do not multiply work. Work quality is `0.35 + 0.65 × log2(1 + normalizedGeneticQuality)`, multiplied by local environment, support sufficiency and prestige memory. Builder and laser contributions are logarithmic. Projects cannot consume beyond their remaining target.
- **One material budget:** the reserve slider assigns a fraction of fresh production before sale. Main and support jobs share that pool; they cannot reserve it twice. Stored materials remain available. Credits buy improvements, not completed phase work. Black-hole transport consumes actual raw material value and has its own staffed throughput.
- **Genetic choices:** Gaussian μ/σ, mutations, newborn truncation and culling costs remain. Growth, textile, materials and compute profiles pursue different genes. Textile favors slower maturation, creating a tradeoff against rapid breeding. Moon supports textiles, Mars compute and Jupiter meat with slower births. Judges use three distinct occupied worlds and the harmonic mean of their assigned role rates, rewarding improvement of the weakest role. Selection labels alone never grant bonuses.
- **Prestige:** five resets unlock the lifetime-knowledge threshold of 160 (the five awards total 162), followed by a sixth journey to a full warehouse. Memory multiplies project work and sphere energy by `(1 + 5 × resets) × (1 + 0.25 × cosmosLevels)`. The final revelation preserves the world; New Game+ is a separate choice.
- **Automation and narrative:** the same 0.1-second scheduler handles frames, offline catch-up and production automation every five seconds. Players commission projects and choose autobuy policies; nothing automatically ignites a black hole. Judges can carry automatic profile selection into later runs. Mechanical milestones deliver short Czech Chronicle entries and Behemot reactions.

The economic growth remains large. The structural change is that multiplying income cannot complete infrastructure, transport or coordination instantly. The UI shows local population/support, project rate, required profile, recipe, reserve and bottleneck.

## Behemot

The old catalog, crates, temporary buffs, relationship axes, overload, containment, rebellion and Wisdom multipliers were removed from runtime code. Historical designs are explicitly archived in `_archiv/behemot/`.

Three permanent, optional tools remain: **Inkubátor** splits a real 10% nursery with independent selection; **Mlékoturbína** trades 25% of remaining milk for energy; **Přepojovací rozvaděč** substitutes bones/skin/cloth at a wasteful 4:1 rate. They solve concrete breeding or supply problems and cannot manufacture work or knowledge. Tools use physical barter and deactivate on prestige until the player reactivates them at their required phase. All baseline strategies below used **no Behemot tools**.

## Measured pacing

Reference: balanced strategy, actual **0.1s** game step, visits every **6h** after a ten-minute onboarding period with minute-level choices at the start of each run. Automation then uses the real game action API. Phase changes are sampled every ten seconds. Values below are hours spent in each phase; phase 11 is a persistent ending, not another grind gate.

| Phase | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Run 6 |
|---|---:|---:|---:|---:|---:|---:|
| 1. Stvoření | 0.05 | 0.03 | 0.02 | 0.01 | 0.01 | 0.01 |
| 2. Množení | 1.41 | 0.34 | 0.19 | 0.14 | 0.12 | 0.11 |
| 3. Královská | 4.96 | 0.47 | 0.23 | 0.13 | 0.09 | 0.07 |
| 4. Nesmrtelnosti | 3.21 | 0.39 | 0.43 | 0.49 | 0.57 | 0.54 |
| 5. Moudrých ovcí | 3.69 | 0.38 | 0.19 | 0.11 | 0.07 | 0.06 |
| 6. Exodu | 8.79 | 1.34 | 0.63 | 0.38 | 0.26 | 0.21 |
| 7. Sféry | 8.43 | 1.47 | 0.75 | 0.47 | 0.33 | 0.27 |
| 8. Rozmnožení sfér | 11.43 | 1.84 | 0.92 | 0.57 | 0.40 | 0.33 |
| 9. Soudců | 5.63 | 0.97 | 0.50 | 0.32 | 0.23 | 0.19 |
| 10. Černé díry | 6.56 | 4.92 | 2.30 | 3.54 | 4.08 | 4.38 |
| 11. Zjevení | — | — | — | — | — | 0.00 |
| Total | 54.17 | 12.17 | 6.17 | 6.17 | 6.17 | 6.17 |

Total: **91 hours, five black-hole resets**. The intended first-run bands were approximately: tutorial minutes; breeding 1–2.5h; commerce 3–6h; elixir 2–5h; research 3–5h; Exodus 6–10h; first sphere 7–10h; additional spheres 9–13h; Judges 4–7h. Later runs deliberately compress mastered systems instead of dividing 100 hours evenly among phases.

The one-second tuning run also finished at 91h. Its largest phase-exit difference from the 0.1s reference was **110 seconds**. This verifies timing convergence for that strategy, not bitwise equality of populations or all strategies. Online/offline production always uses 0.1s and is separately tested for identical scheduling.

**Cadence matters:** balanced visits every 4h / 6h / 8h gave **81h / 91h / 97h**. At 6h cadence, **20.90h** of the total was waiting after a warehouse was already full for the next manual visit (measured at 1s step). Thus about 70.1h was before that readiness point. The final run alone includes 4.25h of such waiting. These numbers are simulated eligible game time; absences longer than the existing eight-hour offline cap increase calendar time.

## Strategy comparison

All five completing strategies were measured with a 1s integration step and six-hour visits. They share the implemented automation; their decisions differ in selection, perk priorities, industry reserve and discretionary purchases.

| Strategy | Total h | First reset h | First-run phases 6–9 h | BH resets |
|---|---:|---:|---:|---:|
| balanced | 91 | 54.17 | 34.31 | 5 |
| genetics | 91 | 54.17 | 32.46 | 5 |
| industry | 91 | 54.17 | 35.87 | 5 |
| capacity | 97 | 54.17 | 35.87 | 5 |
| naive | 151 | 102.17 | 76.46 | 5 |

- **Naive:** no selection; ordinary automation and perks. This remains reachable, but is intentionally a slow lower-skill reference.
- **Capacity:** extra pasture/density purchases and population perks; light general selection. Capacity remains useful but does not dominate completion.
- **Genetics:** 50% newborn rejection, targeted profiles and genetic legacy priorities.
- **Industry:** 80% fresh-production reserve, general selection, builders and lasers.
- **Balanced:** 30% rejection, local profiles, 50% reserve and construction priorities.
- **Capacity-only adversary:** projects disabled, capacity/upgrade automation active. It stays in phase 2 even over 180h. Separate late-game fixtures test enormous capacity/credits, empty colonies, same-world fake coordination and shared material budgets so the early gate is not the sole exploit test.

Equal totals do not mean identical economic performance: six-hour visit boundaries hide some gains. First-run late phases distinguish the strategies. A controlled balanced run **with selection disabled** took **151h**, matching the naive reference, versus 91h with selection. Optional tool checks improved the sphere supply bottleneck without removing staffed work; the total remained on the same 91h visit boundary.

## Validation and reproducibility

```sh
npm test
SHEEP_BALANCE_FULL=1 node test/balance.test.mjs
node scripts/balance-harness.mjs --strategy all --step 1 --visit 6 --json report.json
node scripts/balance-harness.mjs --strategy balanced --step 0.1 --visit 6 --json reference.json
```

The harness exports `runStrategy` and `runMatrix`; options also include `selection: 'none'` and `behemot: true`. Reports include phase entries/exits and durations, local and total capacity/population, utilization, income/sheep, per-herd μ/σ and selection, support/land/density, upgrades, spheres, knowledge, credit/material expenditures, marginal capacity diagnostics and warehouse-ready/manual-wait times. Transition snapshots explicitly identify the newly observed phase. Full JSON is generated on demand; the checked-in [measurement summary](balance-results.json) retains compact timing results.

**Result:** `npm test` and `SHEEP_BALANCE_FULL=1 npm test` passed all 19 test files with zero failures. Validation includes the full Node test suite; the six-strategy matrix; production-step reference; 4h/8h cadence; selection ablation; optional barter tools; migration and repeated save/load; physical material conservation; deterministic catch-up and birth allocation; and real Chromium smoke checks for mobile projects, actual barter/nursery creation, the persistent ending, and loading a v3 save followed by one hour of asynchronous catch-up. No browser console errors or mobile horizontal overflow were observed in those smoke checks.

## Saves, scope and delegation

Schema 4 keeps the existing `incremental-sheep-v3` storage-key base and path isolation. V3 migration preserves cohorts and Gaussian distributions while allocating them among owned worlds, grants support for the migrated population, preserves completed phase milestones and sphere progress, and converts old Behemot consumables once into base material-value credits. Legacy owned artifacts grant the three replacement tools. The browser remains static vanilla JavaScript with no new dependency or build requirement.

Gemini 3.8 Flash through the inspected `agy` interface handled scoped economy/Behemot investigation, industry and barter implementation, harness scaffolding, migration/progression tests, adversarial tests, documentation and a second Behemot review. Its outputs were integrated, corrected and tested centrally. A final broad agy review timed out without findings and was not counted as validation. Two Terra workers handled world/genetic changes and UI integration; their partial output was completed centrally after their worker sessions ended. No Astra subagents were used. The lead retained architecture, cross-system tuning, source review, browser verification and final validation. Worker output alone was not treated as proof: review corrected, among other issues, material reservation, unsupported lore claims, and UI throughput estimates.

## Human playtesting still required

- Discoverability of commissioning a project, configuring autobuy, moving herds and interpreting support versus raw pasture. The harness knows these rules already.
- First-run pacing of large construction jobs. Without selection, phases 7–9 take about **19.4 / 24.9 / 19.7 hours**; readable recovery advice and the feeling of useful choices need human evaluation.
- Whether repeated runs feel satisfyingly mastered or too automated; manual-visit waiting is a material part of total duration.
- Whether distinct profile/environment choices stay interesting once many genetic means approach their expanded limits. The comparisons do not prove that no better dominant strategy exists.
- Value and clarity of the early nursery, milk opportunity cost and emergency substitutions; tool conversions are optional and can change local timing considerably.
- Catch-up responsiveness on low-end phones with many herds, and migration of unusual real saves beyond the tested fixtures.

The 80–120h balanced arc is credible under the stated cadence, with useful genetics and structural progression gates. Human playtesting should judge the experience between those milestones before any stronger balance claim.
