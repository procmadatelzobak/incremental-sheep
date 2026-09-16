# Incremental Sheep — Technical Specification & Architecture

> Definitive architectural reference and design specification following the approved rewrite plan. Original v3 specification is archived in `_archiv/REWRITE-SPEC-v3.md`.

## 1. Modular Configuration Split

Tunable constants and game balance levers are split into three focused modules:
- `src/config.js`: Core gene definitions, min/max bounds, mutation deviations, base economy multipliers, phase unlocks, and prestige knowledge perks.
- `src/content/industry-config.js`: Workforce thresholds, structural project recipes, labor quality scalings, warehouse liquidation rates, and prestige acceleration factors.
- `src/content/habitats.js`: Planetary life-support bases, habitat expansion scaling, charter fees, and herd size demand formulas.

## 2. Herd Model & World Capacity

- **Herd Groups**: Each group belongs to a specific location (`group.worldId`: `earth`, `moon`, `mars`, `jupiter`, `sphere`).
- **Effective Capacity**:
  $$\text{Capacity} = \min\left(\text{Raw Capacity}, \frac{\text{Installed Support}}{\text{Size Demand}}\right)$$
  - **Raw Capacity (Density & Soil)**: Base capacity provided by purchased land parcels scaled by pasture density and soil fertility upgrades on the given world, not raw surface area.
  - **Installed Support**: Life-support infrastructure (`installedSupport(state, worldId)`), scaling with habitat upgrade level ($base \times 4^{level}$).
  - **Size Demand**: $\text{sizeDemand} = \sqrt{\max(0.5, \mu_{\text{size}} / \text{base}_{\text{size}})}$.
  - **Chartering**: Initial colony charter costs establish fixed starter life support on new worlds, making harsh planetary land usable.
  - **Shortfall Mechanics**: Insufficient world capacity throttles labor productivity and growth without killing livestock, preventing cascading death spirals during catch-up.

## 3. Statistical Genetics & Breeding

- **Gaussian Distributions**: Each gene maintains $\{\mu, \sigma\}$. Truncation selection cuts the bottom fraction $p$ using Acklam's inverse CDF $\Phi^{-1}$ and Mills ratio $\lambda = \phi(\alpha) / (1 - \Phi(\alpha))$:
  $$\mu' = \mu + \sigma \lambda, \quad \sigma'^2 = \sigma^2 (1 - \lambda(\lambda - \alpha))$$
- **Newborn Truncation & Variance**: Newborn cohorts blend into the group distribution ($\sigma_{\text{child}}^2 = \sigma_{\text{pop}}^2 / 2 + \text{mutSD}^2$), creating a dynamic mutation-selection equilibrium with no hard freeze.
- **Asymptotic Ceilings**: Gene maximums expand dynamically across game phases; there are no universal hard elite gene gates.

## 4. Industry, Labor & Material Routing

- **Labor Rate**: Driven by adult sheep counts ($n$), scaled by utilization ($\min(1, n / \text{staffThreshold})$ where $\text{staffThreshold} = 1000$), normalized profile quality, environmental factors, and life-support ratios:
  - *Profiles*: Growth ($\text{fertility} / \text{gestation}$), Textile ($\sqrt{\text{woolRate} \cdot \text{woolQuality} / \text{maturity}}$), Materials ($\sqrt{\text{size} \cdot \text{lifespan}}$), Compute ($\text{intelligence}$).
- **Material Routing**: The industrial reserve share (`industry.share`, default 0.5) allocates tick production directly to active projects prior to marketplace auto-selling.
- **Physical Consumption**: Construction projects require genuine physical materials via `consumeRecipe`; work is throttled by real supply bottlenecks without arbitrary artificial timers.
- **Prestige Memory**: $\text{projectMemory} = (1 + 5 \times \text{runs}) \times (1 + 0.25 \times \text{cosmosPerks})$ accelerates labor rate and energy throughput directly; no global production buffs are injected into labor formulas.

## 5. Automation, Schedules & Manager

- **Autobuy Interval**: Deterministic autobuy routines execute every 5 game seconds (`AUTO_INTERVAL = 5`).
- **Phase 9 Soudci & Herd Manager**: Reaching Phase 9 unlocks multi-world coordination (`flags.manager`). The manager routine (`setManager`) automatically aligns breeding profiles with project requirements (`growth`, `textile`, `materials`, `compute`) while preserving full manual control if toggled off.

## 6. Phase Progression & Mechanics

Progress relies on milestone triggers and mechanics gates rather than unmeasured elapsed times. Story milestones trigger reactively on entry (`updateStory`).

| Phase | Name | Unlock Gate Condition | Mechanical Evolution |
|---|---|---|---|
| 1 | Stvoření | Lifetime credits $\ge 1500$ | Baseline herds, wool clipping, slaughter meat. |
| 2 | Množení | Complete `breeding` project | Milk production, directional culling, pasture management, Behemot Incubator. |
| 3 | Královská | Complete `commerce` project | Cloth and cheese processing, monopoly pricing. |
| 4 | Nesmrtelnosti | Craft immortality elixir | Immortal Farmer; accelerated biological cycles (sheep still age and die). |
| 5 | Moudrých ovcí | Complete `research` project | Compute generation, biological parts (bones, skin, brain), space program. |
| 6 | Exodu | Colonize Moon, Mars, Jupiter | Local habitat infrastructure, planetary migration, bulk storage ceilings. |
| 7 | Sféry | Construct 1st Dyson Sphere | Builders, solar energy grid, Behemot Turbine & Switchboard. |
| 8 | Rozmnožení sfér | Construct 5 Dyson Spheres | Laser propulsion beam accelerating subsequent sphere construction. |
| 9 | Soudci | Complete `judges` project | Multi-world triad workforce coordination, automated breeding profiles. |
| 10 | Černé díry | Auto-queue fills Central Warehouse | Production liquidation into central store; queue never auto-ignites. Manual ignition resets run for Knowledge & Perks. |
| 11 | Zjevení | $\ge 5$ BH runs + 6th run threshold | Revelation view remains visible; optional New Game+ without extra black hole count increment. |

## 7. Behemot Emporio Integration

- **Three Physical Tools**:
  1. *Inkubátor* (Phase 2): Splits 10% of a real herd into a nursery on the same world. The nursery has independent selection and shares local capacity; no sheep are created.
  2. *Mlékoturbína* (Phase 7): Toggled conversion redirecting excess milk (default 25% share) into energy at a fixed 0.1 ratio.
  3. *Přepojovací rozvaděč* (Phase 7): Emergency switchboard substituting bones, skin, and cloth at a fixed 4:1 exchange ratio.
- **Persistence & Migration**: Tool ownership persists across prestiges with phase-gated activation. Migrated v3 saves refund legacy consumables into credits at base price, and former one-shot artifacts unlock the complete tool triad.
- **Clean Mechanics**: Trust meters, random crates, overload triggers, and 1-minute buffs are entirely eliminated.

## 8. Target Pacing & Empirical Baseline

- **Target Window**: Balanced for ~100 hours total playtime (80–120h target across 4–8h idle play sessions).
- **Headless Balance Harness Benchmarks**: Simulation runs executed via `node scripts/balance-harness.mjs --strategy all --step 1 --json report.json` evaluate pacing across strategies at 6h check-in visits (five black hole resets, then final sixth run to Singularity / Phase 11):
  - `balanced`: 91h
  - `genetics`: 91h
  - `industry`: 91h
  - `capacity`: 97h
  - `naive`: 151h
- **Verification Details**:
  - The 91h `balanced` run is confirmed under the actual 0.1s simulation step (`SIM_STEP = 0.1`).
  - **No Behemot Required**: All benchmark targets are fully achievable without purchasing or toggling Behemot Emporio tools.
  - **Calibration Scope**: These benchmark metrics reflect automated headless agent runs under scheduled 6h visits; they do not represent a broad claim of universal empirical human play-balance.
  - Full balance logs and detailed metric breakdowns are summarized in [docs/balance-report.md](docs/balance-report.md) .
