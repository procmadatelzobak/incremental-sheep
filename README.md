# Incremental Sheep

Browser-native idle/incremental simulation of aggregated sheep breeding, planetary colonization, and Dyson sphere engineering based on the *Bible Farmářova* lore (`lore/`). Runs entirely client-side with zero build steps, zero backend, and zero external dependencies.

## Quick Start & Local Run

Serve the static root with any local HTTP server:
```bash
python3 -m http.server 8080
# Open http://localhost:8080 in a modern browser
```

## Automated Testing & Benchmarks

All test suites and simulations run natively in Node.js without extra tooling:
```bash
# Run unit & integration test suite
npm test

# Run the headless balance simulation across all strategies
node scripts/balance-harness.mjs --strategy all --step 1 --json report.json
```

## Core Systems & Engine Highlights

- **Aggregate Genetics**: Herds are tracked as continuous Gaussian distributions `{mu, sigma}` per gene rather than individual sheep. Directional selection truncates lower tails while newborn variance and mutations prevent genetic collapse.
- **Save Engine (Schema 4)**: Persisted under the `incremental-sheep-v3` `localStorage` key. Backward-compatible with v3 saves; legacy consumables are converted into base credit refunds.
- **Deterministic Offline Catch-Up**: Evaluates up to 8 hours of offline progress in fixed 0.1s steps (`SIM_STEP = 0.1`) dispatched in cooperative asynchronous batches (`advanceAsync`) to prevent UI freezes.
- **Industrial Routing & Autobuy**: Automatic purchases run every 5 game seconds (`AUTO_INTERVAL = 5`). Material routing deducts industrial reserves prior to market auto-sell routines.
- **Configuration Modularization**: Tunables are separated into `src/config.js` (genetics & economy), `src/content/industry-config.js` (labor, recipes & projects), and `src/content/habitats.js` (worlds & life-support).
- **Pacing & Empirical Benchmarks**: Progression targets ~100h total playtime (80–120h balanced window across 4–8h idle check-in visits). Headless balance harness benchmarks across strategies under 6h check-in visits (five black hole resets, then final sixth run to Singularity / Phase 11):
  - `balanced`: 91h
  - `genetics`: 91h
  - `industry`: 91h
  - `capacity`: 97h
  - `naive`: 151h
  The 91h balanced trajectory is validated under the actual 0.1s simulation step (`SIM_STEP = 0.1`). Zero Behemot tools are required to achieve completion within these benchmark bounds. These benchmarks evaluate automated headless agent heuristics under scheduled visit intervals and do not constitute a broad claim of universal human play-balance. Complete benchmark telemetry and run logs are documented in [docs/balance-report.md](docs/balance-report.md).

## Deployment

The included `sinuhetcloud.conf` serves the static repository with `python3 -m http.server ${PORT}`. No build or database is required. Saves can be exported and imported from the settings panel; preview paths use isolated storage keys.
