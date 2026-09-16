import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import fs from 'node:fs';

import { advance } from '../src/sim/advance.js';
import { newGame } from '../src/io/state.js';
import { totalSheep, PHASES } from '../src/content/phases.js';
import { phaseJob, projectStatus } from '../src/content/industry.js';
import { CATALOG, itemAvailable, toolActive } from '../src/content/behemot.js';
import { resourceCap } from '../src/econ/storage.js';
import {
  setAutobuy, setIndustry, setCull, togglePolicy, setManager, buyPerk, buyWarehouse, behemotBarter, behemotToggle,
  armBlackHole, doIgnite, doSingularity, canIgnite, singularityAvailable,
  buyLand, unlockTier, buyDensity, buyBuilder, buyLaser, craftImmortality, doClaimSphere
} from '../src/econ/actions.js';
import {
  worldCapacity, worldPopulation, landParcelCost, densityCost, densityPhaseCap, canUnlockTier, rawWorldCapacity
} from '../src/content/locations.js';

// Certification note: step=2 is accelerated for tuning; step=0.1 parity is the gold
// standard baseline for certified parity convergence. Player cadence is independent of integration dt.

function calcMarginalDiagnostics(state) {
  const earthCost = landParcelCost(state, 'earth');
  const densCost = state.land.density < densityPhaseCap(state) ? densityCost(state) : Infinity;
  const cost = Math.min(earthCost, densCost);
  const income = Math.max(0.01, state.rates?._income || 0);
  const pop = Math.max(1, totalSheep(state));
  const incomePerSheep = income / pop;
  const copy = structuredClone(state);
  if (earthCost <= densCost) { const w = copy.land.worlds.earth; w.counts[w.tier] = (w.counts[w.tier] || 0) + 1; }
  else copy.land.density++;
  const addedCapacity = Math.max(0, worldCapacity(copy, 'earth') - worldCapacity(state, 'earth'));
  const estAddedIncome = addedCapacity * incomePerSheep;
  return {
    cost,
    costOverIncome: cost / income,
    costOverAddedIncome: estAddedIncome > 0 ? cost / estAddedIncome : null,
    pendingLimits: {
      density: state.land?.density || 0,
      densityCap: densityPhaseCap(state),
      earthCap: worldCapacity(state, 'earth'),
      earthPop: worldPopulation(state, 'earth')
    }
  };
}

function detectBottleneck(state) {
  if (state.phase >= 11) return 'singularity_complete';
  if (state.phase === 10) return canIgnite(state) ? 'awaiting_player_ignition' : state.prestige.armed ? 'warehouse_transport_or_supply' : 'warehouse_not_armed';
  if (!state.industry.enabled && state.phase >= 2) return 'projects_disabled';
  const job = phaseJob(state), status = projectStatus(state);
  if (job) return `${job.id}:${status.rate > 0 ? status.bottleneck === 'none' ? 'labor' : status.bottleneck : 'awaiting_first_work'}`;
  if (state.phase === 4 && !state.flags.immortal) return 'elixir_craft';
  return 'credits';
}

function takePhaseSnapshot(state, phaseNum, entryTimeSec, exitTimeSec) {
  const pop = totalSheep(state);
  const cap = ['earth', 'moon', 'mars', 'jupiter', 'sphere'].reduce((acc, w) => acc + worldCapacity(state, w), 0);
  const creditsPerSec = state.rates?._income || 0;
  const creditsPerSheep = pop > 0 ? creditsPerSec / pop : 0;
  const spent = Object.values(state.stats?.spent || {}).reduce((a, b) => a + b, 0);
  const industrySpent = { ...state.industry?.spent };

  const genes = {};
  for (const g of state.groups) {
    const key = `${g.id}:${g.name || 'herd'}`;
    genes[key] = {};
    for (const [k, v] of Object.entries(g.genes || {})) {
      genes[key][k] = { mu: +v.mu.toFixed(3), sigma: +v.sigma.toFixed(3) };
    }
  }

  const tiers = {};
  const support = {};
  for (const [w, land] of Object.entries(state.land?.worlds || {})) {
    tiers[w] = land.tier || 0;
    support[w] = { ...state.industry.worlds[w] };
  }

  return {
    phase: phaseNum,
    // Transitions are observed every 10s. Metrics describe the observation
    // state, which has already entered the next phase; durations describe exit.
    observedPhase: state.phase,
    name: PHASES[phaseNum]?.name || `Phase ${phaseNum}`,
    entryTimeSec,
    exitTimeSec,
    durationHours: +((exitTimeSec - entryTimeSec) / 3600).toFixed(4),
    population: pop,
    capacity: cap,
    utilization: cap > 0 ? +(pop / cap).toFixed(4) : 0,
    creditsPerSec: +creditsPerSec.toFixed(2),
    creditsPerSheep: +creditsPerSheep.toFixed(4),
    genes,
    herds: state.groups.map(g => ({ id: g.id, name: g.name, worldId: g.worldId, selection: { ...g.policy.cull } })),
    worlds: Object.fromEntries(['earth', 'moon', 'mars', 'jupiter', 'sphere'].map(w => [w, { population: worldPopulation(state, w), capacity: worldCapacity(state, w), rawCapacity: rawWorldCapacity(state, w) }])),
    upgrades: { ...(state.upgrades || {}) },
    density: state.land?.density || 0,
    tiers,
    support,
    sphereCount: state.projects?.dyson?.count || 0,
    knowledge: state.prestige?.knowledge || 0,
    spent,
    industrySpent,
    creditSpending: { ...state.stats.spent },
    bottleneck: detectBottleneck(state),
    marginalDiagnostics: calcMarginalDiagnostics(state)
  };
}

function buyPerksWithPriorities(state, perkList) {
  if (!state.prestige || !perkList || !perkList.length) return;
  let bought = true;
  let guard = 0;
  while (bought && guard++ < 40 && (state.prestige.knowledge || 0) > 0) {
    bought = false;
    for (const perk of perkList) {
      if (buyPerk(state, perk)) { bought = true; break; }
    }
  }
}

const STRATEGIES = Object.fromEntries(['naive', 'capacity', 'genetics', 'industry', 'balanced', 'capacity-only'].map(name => [name, {
  init(s) {
    setIndustry(s, { enabled: name !== 'capacity-only', share: name === 'industry' ? .8 : .5 });
    for (const k of ['sheep', 'land', 'upgrades', 'sphere']) setAutobuy(s, k, k !== 'sphere' || name !== 'capacity-only');
  },
  onVisit(s, opts) {
    const perks = name === 'genetics' ? ['legacy', 'cosmos', 'foreknow', 'headstart', 'foresight']
      : name === 'capacity' ? ['flock', 'voyage', 'legacy', 'cosmos', 'headstart']
      : ['cosmos', 'legacy', 'headstart', 'foreknow', 'voyage', 'foresight'];
    buyPerksWithPriorities(s, perks);
    if (!opts.noSelection && ['balanced', 'genetics'].includes(name)) setManager(s, true);
    for (const g of s.groups) {
      if (s.phase >= 2 && !g.policy.killOld) togglePolicy(s, g.id, 'killOld');
      if (opts.noSelection || name === 'capacity-only' || name === 'naive') { setCull(s, g.id, { enabled: false }); continue; }
      let gene = 'breedingScore';
      if (name === 'balanced' || name === 'genetics') {
        const world = g.worldId || 'earth';
        let profile = s.phase <= 2 ? 'growth' : s.phase <= 4 ? 'textile' : 'compute';
        if (s.phase >= 6) profile = world === 'moon' ? 'textile' : world === 'mars' ? 'compute' : 'materials';
        gene = 'profile:' + profile;
      }
      setCull(s, g.id, { enabled: true, gene, cutFrac: name === 'genetics' ? .5 : name === 'balanced' ? .3 : .2 });
    }
    if (name === 'capacity') {
      for (const wk of ['earth', 'moon', 'mars', 'jupiter']) {
        buyLand(s, wk); if (canUnlockTier(s, wk)) unlockTier(s, wk);
      }
      buyDensity(s);
    }
    if (name === 'industry' || name === 'balanced') {
      if (s.phase >= 7) buyBuilder(s);
      if (s.phase >= 8) buyLaser(s);
    }
    if (s.phase === 4) craftImmortality(s);
    if (s.phase >= 7) doClaimSphere(s);
  }
}]));

export function runStrategy(name, options = {}) {
  const strat = STRATEGIES[name];
  if (!strat) throw new Error(`Unknown strategy: ${name}`);

  const step = Number(options.step ?? 2);
  const maxHours = Number(options.maxHours ?? 180);
  if (!(step >= .1 && step <= 5 && maxHours > 0)) throw new Error('Invalid simulation bounds');
  const maxRuns = Number(options.maxRuns ?? 8);
  const visitHours = Number(options.visitHours ?? 6);
  if (!(Number.isFinite(visitHours) && visitHours > 0 && visitHours <= 8)) throw new Error('Visits must be within the eight-hour offline cap');
  const onSnapshot = options.onSnapshot || null;
  const noSelection = options.selection === 'none' || options.selection === 'noSelection';

  let state = newGame(null);
  strat.init(state, { noSelection });

  let totalSimSeconds = 0;
  const maxSimSeconds = maxHours * 3600;
  const runs = [];
  let bhIgnitions = 0;
  let warehouseReadyAt = null;

  let currentRunIndex = 0;
  let runSimSeconds = 0;
  let currentRunPhases = [];
  let currentPhase = state.phase;
  let phaseEntryRunSeconds = 0;
  let nextVisitRunSeconds = 60;
  let nextSampleTotalSeconds = 0;
  const samples = [];

  let completed = false;
  let endReason = 'timeout';
  const chunkDt = 10;

  while (totalSimSeconds < maxSimSeconds && currentRunIndex < maxRuns) {
    const chunk = Math.min(chunkDt, maxSimSeconds - totalSimSeconds);
    advance(state, chunk, step);
    totalSimSeconds += chunk;
    runSimSeconds += chunk;

    // Check phase transition
    if (state.phase !== currentPhase) {
      if (state.phase > currentPhase) {
        for (let p = currentPhase; p < state.phase; p++) {
          currentRunPhases.push(takePhaseSnapshot(state, p, phaseEntryRunSeconds, runSimSeconds));
          phaseEntryRunSeconds = runSimSeconds;
        }
      }
      currentPhase = state.phase;
      if (currentPhase === 11) {
        currentRunPhases.push(takePhaseSnapshot(state, 11, runSimSeconds, runSimSeconds));
        runs.push({ runIndex: currentRunIndex, durationHours: +(runSimSeconds / 3600).toFixed(4), warehouseReadyAtSec: warehouseReadyAt, playerWaitHours: warehouseReadyAt === null ? 0 : +((runSimSeconds - warehouseReadyAt) / 3600).toFixed(4), phases: currentRunPhases });
        completed = true;
        endReason = 'singularity';
        break;
      }
    }

    if (state.phase === 10 && canIgnite(state) && warehouseReadyAt === null) warehouseReadyAt = runSimSeconds;

    // Player visits
    if (runSimSeconds >= nextVisitRunSeconds) {
      strat.onVisit(state, { noSelection });
    // Optional tool strategy uses the same physical barter and storage actions.
    if (options.behemot) {
      for (const item of CATALOG.filter(it => itemAvailable(state, it))) {
        if (!state.behemot.inv[item.id]) {
          for (let i = 0; i < 20 && Object.entries(item.cost).some(([key, n]) => resourceCap(state, key) < n); i++) {
            if (!buyWarehouse(state)) break;
          }
          behemotBarter(state, item.id);
        }
        if (state.behemot.inv[item.id] && !toolActive(state, item.id)) behemotToggle(state, item.id);
      }
    }

      const cadenceSec = runSimSeconds < 600 ? 60 : visitHours * 3600;
      nextVisitRunSeconds = runSimSeconds + cadenceSec;

      // Phase 10 prestige handling
      if (state.phase === 10) {
        if (!state.prestige.armed) armBlackHole(state);
        if (singularityAvailable(state)) {
          doSingularity(state);
          currentRunPhases.push(takePhaseSnapshot(state, 10, phaseEntryRunSeconds, runSimSeconds));
          currentRunPhases.push(takePhaseSnapshot(state, 11, runSimSeconds, runSimSeconds));
          runs.push({ runIndex: currentRunIndex, durationHours: +(runSimSeconds / 3600).toFixed(4), warehouseReadyAtSec: warehouseReadyAt, playerWaitHours: warehouseReadyAt === null ? 0 : +((runSimSeconds - warehouseReadyAt) / 3600).toFixed(4), phases: currentRunPhases });
          completed = true;
          endReason = 'singularity';
          break;
        } else if (canIgnite(state)) {
          currentRunPhases.push(takePhaseSnapshot(state, 10, phaseEntryRunSeconds, runSimSeconds));
          runs.push({ runIndex: currentRunIndex, durationHours: +(runSimSeconds / 3600).toFixed(4), warehouseReadyAtSec: warehouseReadyAt, playerWaitHours: warehouseReadyAt === null ? 0 : +((runSimSeconds - warehouseReadyAt) / 3600).toFixed(4), phases: currentRunPhases });
          bhIgnitions++;

          doIgnite(state);
          currentRunIndex++;
          runSimSeconds = 0;
          warehouseReadyAt = null;
          currentRunPhases = [];
          currentPhase = state.phase;
          phaseEntryRunSeconds = 0;
          nextVisitRunSeconds = 60;

          strat.init(state, { noSelection });
          strat.onVisit(state, { noSelection });
        }
      }
    }

    // Hourly sample
    if (totalSimSeconds >= nextSampleTotalSeconds) {
      const sample = {
        hour: +(totalSimSeconds / 3600).toFixed(2),
        run: currentRunIndex,
        phase: state.phase,
        pop: totalSheep(state),
        credits: Math.floor(state.resources?.credits || 0),
        credRate: +(state.rates?._income || 0).toFixed(2),
        knowledge: state.prestige?.knowledge || 0,
        spheres: state.projects?.dyson?.count || 0
      };
      samples.push(sample);
      if (onSnapshot) onSnapshot(sample, state);
      nextSampleTotalSeconds += 3600;
    }
  }

  if (!completed) {
    currentRunPhases.push(takePhaseSnapshot(state, currentPhase, phaseEntryRunSeconds, runSimSeconds));
    runs.push({ runIndex: currentRunIndex, durationHours: +(runSimSeconds / 3600).toFixed(4), warehouseReadyAtSec: warehouseReadyAt, playerWaitHours: warehouseReadyAt === null ? 0 : +((runSimSeconds - warehouseReadyAt) / 3600).toFixed(4), phases: currentRunPhases });
    endReason = currentRunIndex >= maxRuns ? 'max_runs' : (name === 'capacity-only' ? 'stalled' : 'timeout');
  }

  return {
    strategy: name,
    completed,
    totalGameTime: totalSimSeconds,
    totalHours: +(totalSimSeconds / 3600).toFixed(2),
    runsCount: runs.length,
    bhIgnitions,
    endReason,
    step, visitHours, noSelection, behemot: !!options.behemot,
    runs,
    samples
  };
}

export function runMatrix(options = {}) {
  const names = ['naive', 'capacity', 'genetics', 'industry', 'balanced', 'capacity-only'];
  const results = {};
  for (const name of names) {
    results[name] = runStrategy(name, options);
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const getArg = (key, fallback) => {
    const idx = args.indexOf(key);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : fallback;
  };

  const strategy = getArg('--strategy', 'balanced');
  const step = Number(getArg('--step', 2));
  const maxHours = Number(getArg('--hours', 180));
  const visitHours = Number(getArg('--visit', 6));
  const jsonPath = getArg('--json', null);

  const report = strategy === 'all'
    ? runMatrix({ step, maxHours, visitHours })
    : runStrategy(strategy, { step, maxHours, visitHours });

  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  } else {
    console.log(JSON.stringify(
      Array.isArray(report) || report.strategy
        ? { strategy: report.strategy, completed: report.completed, totalHours: report.totalHours, runsCount: report.runsCount, bhIgnitions: report.bhIgnitions, endReason: report.endReason }
        : Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { completed: v.completed, totalHours: v.totalHours, bhIgnitions: v.bhIgnitions, endReason: v.endReason }])),
      null,
      2
    ));
  }
}
