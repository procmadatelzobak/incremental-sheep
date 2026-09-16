import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import assert from 'node:assert';
import test from 'node:test';

import { runStrategy, runMatrix } from '../scripts/balance-harness.mjs';

const step = Number(process.env.SHEEP_SIM_STEP || 1);
const runFullMatrix = process.env.SHEEP_BALANCE_FULL === '1';

test('Incremental Sheep Balance Simulation Suite', async (t) => {
  if (runFullMatrix) {
    await t.test('Full Matrix Execution across all 6 strategies', () => {
      const matrix = runMatrix({ step, maxHours: 180, visitHours: 6 });
      for (const [name, res] of Object.entries(matrix)) {
        console.log(`[Matrix] ${name.padEnd(14)}: completed=${res.completed}, totalHours=${res.totalHours}h, runs=${res.runsCount}, endReason=${res.endReason}`);
        if (name !== 'capacity-only') {
          assert(res.completed, `${name} must reach revelation`);
          assert(res.totalHours <= 180);
          assert(res.bhIgnitions >= 3 && res.bhIgnitions <= 6);
        }
        if (name === 'balanced') assert(res.totalHours >= 80 && res.totalHours <= 120);
        if (name === 'capacity-only') {
          assert.strictEqual(res.completed, false, 'capacity-only must stall');
          const maxPhase = Math.max(...res.runs.flatMap(r => r.phases.map(p => p.phase)));
          assert(maxPhase <= 2, `capacity-only cannot surpass phase 2, got ${maxPhase}`);
        }
      }
      const lateTime = report => report.runs[0].phases.filter(p => p.phase >= 6 && p.phase <= 9).reduce((n, p) => n + p.durationHours, 0);
      assert(lateTime(matrix.genetics) < lateTime(matrix.naive) * .8, 'Targeted genetics must materially improve the first late-game journey');
      assert(matrix.capacity.totalHours >= matrix.balanced.totalHours * .85, 'Capacity purchases must not undercut the balanced journey dramatically');
      const first = matrix.balanced.runs[0].phases;
      assert(first.find(p => p.phase === 9).durationHours > .25, 'Judges must require real coordination work');
      for (let phase = 6; phase < 9; phase++) {
        assert(first.find(p => p.phase === phase).durationHours + first.find(p => p.phase === phase + 1).durationHours >= 2,
          `Late phase pair ${phase}/${phase + 1} must not collapse into minutes`);
      }
    });
    return;
  }

  await t.test('Balanced Strategy structural progression to Singularity', () => {
    const report = runStrategy('balanced', { step, maxHours: 180, visitHours: 6 });

    // Print first run phases
    console.log('\n=== Balanced Strategy: First Run Phases ===');
    const firstRun = report.runs[0] || { phases: [] };
    for (const p of firstRun.phases) {
      console.log(`Phase ${String(p.phase).padStart(2)} [${p.name.padEnd(16)}]: ` +
        `duration=${p.durationHours.toFixed(2)}h, pop=${p.population}, cap=${p.capacity}, bottleneck=${p.bottleneck}`);
    }

    // Print all runs summary
    console.log('\n=== Balanced Strategy: Run Summary ===');
    report.runs.forEach((r, idx) => {
      const pSummary = r.phases.map(p => `P${p.phase}`).join('->');
      console.log(`Run ${idx}: duration=${r.durationHours.toFixed(2)}h, phases=${pSummary}`);
    });
    console.log(`End Reason: ${report.endReason}`);
    console.log(`Strategy Total: ${report.totalHours}h, BH Ignitions: ${report.bhIgnitions}, Completed: ${report.completed}\n`);

    // Structural assertions
    assert.strictEqual(report.completed, true, 'Balanced strategy should achieve Singularity');
    assert(report.totalHours < 180, `Total time must be under 180h (got ${report.totalHours}h)`);
    assert(report.totalHours >= 80 && report.totalHours <= 120, `Singularity expected in window 80-120h (got ${report.totalHours}h)`);
    assert(report.bhIgnitions >= 3 && report.bhIgnitions <= 6, `Black Hole ignitions expected between 3 and 6 (got ${report.bhIgnitions})`);

    // First run phase 9 duration > 0.25h
    const phase9 = firstRun.phases.find(p => p.phase === 9);
    assert(phase9, 'First run must reach phase 9');
    assert(phase9.durationHours > 0.25, `First run phase 9 duration must exceed 0.25h (got ${phase9.durationHours.toFixed(2)}h)`);

    // No consecutive late phases (6-9) below 1h on first run
    const latePhases = firstRun.phases.filter(p => p.phase >= 6 && p.phase <= 9);
    for (let i = 0; i < latePhases.length - 1; i++) {
      const cur = latePhases[i];
      const nxt = latePhases[i + 1];
      assert(!(cur.durationHours < 1.0 && nxt.durationHours < 1.0),
        `Consecutive late phases ${cur.phase} (${cur.durationHours}h) and ${nxt.phase} (${nxt.durationHours}h) are both under 1h`);
    }
  });

  await t.test('Capacity-Only strategy stall check', () => {
    const report = runStrategy('capacity-only', { step, maxHours: 24, visitHours: 6 });
    assert.strictEqual(report.completed, false, 'Capacity-only must not complete Singularity');
    assert.strictEqual(report.endReason, 'stalled', 'End reason should be stalled');

    const maxPhase = Math.max(...report.runs.flatMap(r => r.phases.map(p => p.phase)));
    assert(maxPhase <= 2, `Capacity-only cannot surpass phase 2 (reached phase ${maxPhase})`);
    console.log(`Capacity-only verified: stalled at phase ${maxPhase} over ${report.totalHours}h.`);
  });
});

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // Direct CLI invocation
}
