/**
 * Safety-rule tests for the orphaned-snapshot sweep core.
 *
 * Runs with Node's built-in test runner (node --test, native TS stripping):
 *   pnpm --filter @workspace/api-server run test
 *
 * The two rules that must never regress:
 *  1. Objects referenced by a look's snapshotDataUrl are never deleted.
 *  2. Unreferenced objects newer than MIN_ORPHAN_AGE_MS (or with a
 *     missing/unparseable timestamp) are never deleted.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MASS_DELETE_PREVIEW_SAMPLE,
  MAX_CONSECUTIVE_DELETE_FAILURES,
  MAX_DELETE_FAILURE_RATE,
  MIN_FAILURE_RATE_SAMPLE,
  MAX_DELETE_FRACTION,
  MIN_ORPHAN_AGE_MS,
  runSweep,
  type MassDeletePreview,
  type StoredObject,
  type SweepDeps,
} from './snapshotSweepCore.ts';

const PRIVATE_DIR = '/test-bucket/.private';
const NOW = Date.parse('2026-07-23T12:00:00Z');

function makeObject(
  name: string,
  ageMs: number | null,
  deleted: string[],
): StoredObject {
  return {
    name: `.private/uploads/${name}`,
    metadata:
      ageMs === null ? {} : { timeCreated: new Date(NOW - ageMs).toISOString() },
    delete: async () => {
      deleted.push(name);
    },
  };
}

const silentLog = { info: () => {}, error: () => {} };

function makeDeps(objects: StoredObject[], referencedIds: string[]): SweepDeps {
  return {
    getPrivateObjectDir: () => `${PRIVATE_DIR}/`, // trailing slash on purpose
    getReferencedSnapshotUrls: async () => referencedIds.map((id) => `/objects/${id}`),
    listObjects: async (bucketName, prefix) => {
      assert.equal(bucketName, 'test-bucket');
      assert.equal(prefix, '.private/uploads/');
      return objects;
    },
    now: () => NOW,
  };
}

const OLD = MIN_ORPHAN_AGE_MS + 60 * 60 * 1000; // 25h old
const FRESH = MIN_ORPHAN_AGE_MS - 60 * 60 * 1000; // 23h old

test('only old unreferenced objects are deleted; referenced, fresh, and timestamp-less objects survive', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('referenced-old.png', OLD, deleted), // referenced -> keep
    makeObject('orphan-old.png', OLD, deleted), // old orphan -> delete
    makeObject('orphan-fresh.png', FRESH, deleted), // fresh orphan -> keep
    makeObject('orphan-no-timestamp.png', null, deleted), // no timestamp -> keep
  ];
  const deps = makeDeps(objects, ['uploads/referenced-old.png']);

  const result = await runSweep(deps, { dryRun: false, log: silentLog });

  assert.deepEqual(deleted, ['orphan-old.png']);
  assert.equal(result.stored, 4);
  assert.equal(result.referenced, 1);
  assert.equal(result.orphans, 1);
  assert.equal(result.skippedRecent, 2); // fresh orphan + missing timestamp
  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.dryRun, false);
});

test('referenced objects are never deleted even when very old', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('a.png', 365 * 24 * 60 * 60 * 1000, deleted),
    makeObject('b.png', OLD, deleted),
  ];
  const deps = makeDeps(objects, ['uploads/a.png', 'uploads/b.png']);

  const result = await runSweep(deps, { dryRun: false, log: silentLog });

  assert.deepEqual(deleted, []);
  assert.equal(result.orphans, 0);
  assert.equal(result.deleted, 0);
});

test('object exactly at the age threshold is still skipped (strictly-older rule)', async () => {
  const deleted: string[] = [];
  const objects = [makeObject('edge.png', MIN_ORPHAN_AGE_MS - 1, deleted)];

  const result = await runSweep(makeDeps(objects, []), { dryRun: false, log: silentLog });

  assert.deepEqual(deleted, []);
  assert.equal(result.skippedRecent, 1);
});

test('unparseable timestamp is treated as recent and skipped', async () => {
  const deleted: string[] = [];
  const objects: StoredObject[] = [
    {
      name: '.private/uploads/bad-ts.png',
      metadata: { timeCreated: 'not-a-date' },
      delete: async () => {
        deleted.push('bad-ts.png');
      },
    },
  ];

  const result = await runSweep(makeDeps(objects, []), { dryRun: false, log: silentLog });

  assert.deepEqual(deleted, []);
  assert.equal(result.skippedRecent, 1);
  assert.equal(result.deleted, 0);
});

test('dry-run never calls delete but still reports orphans and skippedRecent', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('orphan-old.png', OLD, deleted),
    makeObject('orphan-fresh.png', FRESH, deleted),
  ];

  const result = await runSweep(makeDeps(objects, []), { dryRun: true, log: silentLog });

  assert.deepEqual(deleted, []);
  assert.equal(result.orphans, 1);
  assert.equal(result.skippedRecent, 1);
  assert.equal(result.deleted, 0);
  assert.equal(result.dryRun, true);
});

test('safety trip: aborts when references are empty but storage is not', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];

  const result = await runSweep(makeDeps(objects, []), { dryRun: false, log: silentLog });

  assert.deepEqual(deleted, []);
  assert.equal(result.safetyTripped, true);
  assert.match(result.safetyReason ?? '', /no referenced snapshots/);
  assert.equal(result.deleted, 0);
});

test('safety trip: aborts when orphans exceed the mass-deletion threshold', async () => {
  const deleted: string[] = [];
  // 3 of 4 stored objects would be deleted (75% > 50%).
  const objects = [
    makeObject('kept.png', OLD, deleted),
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
    makeObject('orphan-3.png', OLD, deleted),
  ];
  const deps = makeDeps(objects, ['uploads/kept.png']);

  const result = await runSweep(deps, { dryRun: false, log: silentLog });

  assert.deepEqual(deleted, []);
  assert.equal(result.safetyTripped, true);
  assert.match(result.safetyReason ?? '', /mass-deletion threshold/);
  assert.equal(result.deleted, 0);
});

test('safety trip logs the abort as an error', async () => {
  const errors: string[] = [];
  const log = { info: () => {}, error: (msg: string) => errors.push(msg) };
  const objects = [makeObject('orphan.png', OLD, [])];

  await runSweep(makeDeps(objects, []), { dryRun: false, log });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /SAFETY TRIP/);
});

test('no safety trip when deletions stay at or under the threshold', async () => {
  const deleted: string[] = [];
  // 2 of 4 stored objects deleted (exactly 50%, not strictly greater).
  const objects = [
    makeObject('kept-1.png', OLD, deleted),
    makeObject('kept-2.png', OLD, deleted),
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];
  const deps = makeDeps(objects, ['uploads/kept-1.png', 'uploads/kept-2.png']);

  const result = await runSweep(deps, { dryRun: false, log: silentLog });

  assert.equal(MAX_DELETE_FRACTION, 0.5);
  assert.equal(result.safetyTripped, false);
  assert.deepEqual(deleted.sort(), ['orphan-1.png', 'orphan-2.png']);
});

test('safety trip also applies in dry-run mode', async () => {
  const result = await runSweep(makeDeps([makeObject('orphan.png', OLD, [])], []), {
    dryRun: true,
    log: silentLog,
  });

  assert.equal(result.safetyTripped, true);
  assert.equal(result.dryRun, true);
});

test('forceMassDelete bypasses the mass-deletion threshold and deletes orphans', async () => {
  const deleted: string[] = [];
  // 3 of 4 stored objects would be deleted (75% > 50%).
  const objects = [
    makeObject('kept.png', OLD, deleted),
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
    makeObject('orphan-3.png', OLD, deleted),
  ];
  const deps = makeDeps(objects, ['uploads/kept.png']);

  const result = await runSweep(deps, {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
  });

  assert.deepEqual(deleted.sort(), ['orphan-1.png', 'orphan-2.png', 'orphan-3.png']);
  assert.equal(result.safetyTripped, false);
  assert.equal(result.safetyOverridden, true);
  assert.match(result.safetyReason ?? '', /mass-deletion threshold/);
  assert.equal(result.deleted, 3);
});

test('forceMassDelete bypasses the zero-references breaker', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
  });

  assert.deepEqual(deleted.sort(), ['orphan-1.png', 'orphan-2.png']);
  assert.equal(result.safetyTripped, false);
  assert.equal(result.safetyOverridden, true);
  assert.match(result.safetyReason ?? '', /no referenced snapshots/);
});

test('forceMassDelete override is loudly logged as an error', async () => {
  const errors: string[] = [];
  const log = { info: () => {}, error: (msg: string) => errors.push(msg) };
  const objects = [makeObject('orphan.png', OLD, [])];

  await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
    auditMassDeletion: async () => {},
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /SAFETY OVERRIDE/);
});

test('forceMassDelete still respects the fresh-object and referenced rules', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('referenced.png', OLD, deleted),
    makeObject('orphan-old.png', OLD, deleted),
    makeObject('orphan-fresh.png', FRESH, deleted),
  ];
  const deps = makeDeps(objects, ['uploads/referenced.png']);

  const result = await runSweep(deps, {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
  });

  assert.deepEqual(deleted, ['orphan-old.png']);
  assert.equal(result.skippedRecent, 1);
});

test('forced mass delete shows a preview and requires confirmation before deleting', async () => {
  const deleted: string[] = [];
  const infos: string[] = [];
  const log = { info: (msg: string) => infos.push(msg), error: () => {} };
  const objects = [
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];
  let preview: MassDeletePreview | undefined;

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log,
    forceMassDelete: true,
    confirmMassDelete: async (p) => {
      preview = p;
      // Nothing may be deleted before confirmation is given.
      assert.deepEqual(deleted, []);
      return true;
    },
  });

  assert.ok(preview);
  assert.equal(preview.stored, 2);
  assert.equal(preview.orphans, 2);
  assert.match(preview.safetyReason, /no referenced snapshots/);
  assert.deepEqual(preview.sampleNames.sort(), [
    '.private/uploads/orphan-1.png',
    '.private/uploads/orphan-2.png',
  ]);
  // The preview is also logged (count + object names).
  assert.ok(infos.some((m) => m.includes('PERMANENTLY delete 2 of 2')));
  assert.ok(infos.some((m) => m.includes('orphan-1.png')));
  assert.equal(result.confirmationDeclined, false);
  assert.equal(result.deleted, 2);
});

test('forced mass delete aborts when confirmation is declined', async () => {
  const deleted: string[] = [];
  const errors: string[] = [];
  const log = { info: () => {}, error: (msg: string) => errors.push(msg) };
  const objects = [
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log,
    forceMassDelete: true,
    confirmMassDelete: async () => false,
  });

  assert.deepEqual(deleted, []);
  assert.equal(result.confirmationDeclined, true);
  assert.equal(result.deleted, 0);
  assert.equal(result.safetyOverridden, true);
  assert.ok(errors.some((m) => /ABORTED: forced mass deletion was not confirmed/.test(m)));
});

test('forced mass delete aborts when no confirmation callback is provided', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
  });

  assert.deepEqual(deleted, []);
  assert.equal(result.confirmationDeclined, true);
  assert.equal(result.deleted, 0);
});

test('preview sample is capped and reports the remainder', async () => {
  const deleted: string[] = [];
  const infos: string[] = [];
  const log = { info: (msg: string) => infos.push(msg), error: () => {} };
  const objects = Array.from({ length: MASS_DELETE_PREVIEW_SAMPLE + 5 }, (_, i) =>
    makeObject(`orphan-${i}.png`, OLD, deleted),
  );
  let preview: MassDeletePreview | undefined;

  await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log,
    forceMassDelete: true,
    confirmMassDelete: async (p) => {
      preview = p;
      return false;
    },
  });

  assert.ok(preview);
  assert.equal(preview.sampleNames.length, MASS_DELETE_PREVIEW_SAMPLE);
  assert.equal(preview.orphans, MASS_DELETE_PREVIEW_SAMPLE + 5);
  assert.ok(infos.some((m) => m.includes('... and 5 more')));
});

test('dry-run with forceMassDelete does not require confirmation and deletes nothing', async () => {
  const deleted: string[] = [];
  let confirmCalled = false;
  const objects = [makeObject('orphan.png', OLD, deleted)];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: true,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => {
      confirmCalled = true;
      return true;
    },
  });

  assert.equal(confirmCalled, false);
  assert.deepEqual(deleted, []);
  assert.equal(result.confirmationDeclined, false);
  assert.equal(result.safetyOverridden, true);
});

test('forceMassDelete does not set safetyOverridden when the breaker would not trip', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('kept-1.png', OLD, deleted),
    makeObject('kept-2.png', OLD, deleted),
    makeObject('kept-3.png', OLD, deleted),
    makeObject('orphan.png', OLD, deleted),
  ];
  const deps = makeDeps(objects, [
    'uploads/kept-1.png',
    'uploads/kept-2.png',
    'uploads/kept-3.png',
  ]);

  const result = await runSweep(deps, {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
  });

  assert.equal(result.safetyOverridden, false);
  assert.equal(result.safetyTripped, false);
  assert.deepEqual(deleted, ['orphan.png']);
});

test('without forceMassDelete, the breaker still trips (default unchanged)', async () => {
  const deleted: string[] = [];
  const objects = [
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];

  const result = await runSweep(makeDeps(objects, []), { dryRun: false, log: silentLog });

  assert.deepEqual(deleted, []);
  assert.equal(result.safetyTripped, true);
  assert.equal(result.safetyOverridden, false);
});

test('a failing delete is counted as failed, not deleted', async () => {
  const objects: StoredObject[] = [
    makeObject('kept.png', OLD, []),
    {
      name: '.private/uploads/orphan-old.png',
      metadata: { timeCreated: new Date(NOW - OLD).toISOString() },
      delete: async () => {
        throw new Error('storage unavailable');
      },
    },
  ];
  const deps = makeDeps(objects, ['uploads/kept.png']);

  const result = await runSweep(deps, { dryRun: false, log: silentLog });

  assert.equal(result.failed, 1);
  assert.equal(result.deleted, 0);
  assert.equal(result.abortedOnFailures, false);
});

function makeFailingObject(name: string, attempted: string[]): StoredObject {
  return {
    name: `.private/uploads/${name}`,
    metadata: { timeCreated: new Date(NOW - OLD).toISOString() },
    delete: async () => {
      attempted.push(name);
      throw new Error('storage unavailable');
    },
  };
}

test('sweep aborts mid-run after MAX_CONSECUTIVE_DELETE_FAILURES consecutive failures', async () => {
  const attempted: string[] = [];
  const errors: string[] = [];
  const log = { info: () => {}, error: (msg: string) => errors.push(msg) };
  const total = MAX_CONSECUTIVE_DELETE_FAILURES + 5;
  const objects: StoredObject[] = [
    // Enough referenced objects to keep the mass-delete breaker quiet.
    ...Array.from({ length: total * 2 }, (_, i) => makeObject(`kept-${i}.png`, OLD, [])),
    ...Array.from({ length: total }, (_, i) => makeFailingObject(`fail-${i}.png`, attempted)),
  ];
  const referenced = Array.from({ length: total * 2 }, (_, i) => `uploads/kept-${i}.png`);
  const deps = makeDeps(objects, referenced);

  const result = await runSweep(deps, { dryRun: false, log });

  // Only the first N failing deletes are attempted; the rest are skipped.
  assert.equal(attempted.length, MAX_CONSECUTIVE_DELETE_FAILURES);
  assert.equal(result.failed, MAX_CONSECUTIVE_DELETE_FAILURES);
  assert.equal(result.deleted, 0);
  assert.equal(result.abortedOnFailures, true);
  assert.match(result.abortReason ?? '', /consecutive delete failures/);
  assert.equal(result.skippedAfterAbort, total - MAX_CONSECUTIVE_DELETE_FAILURES);
  assert.ok(errors.some((m) => /ABORTED MID-RUN/.test(m)));
});

test('a successful delete resets the consecutive-failure counter', async () => {
  const deleted: string[] = [];
  const attempted: string[] = [];
  // Alternate fail/success so consecutive failures never reach the limit.
  const objects: StoredObject[] = [];
  const referenced: string[] = [];
  for (let i = 0; i < MAX_CONSECUTIVE_DELETE_FAILURES; i++) {
    objects.push(makeFailingObject(`fail-${i}.png`, attempted));
    objects.push(makeObject(`ok-${i}.png`, OLD, deleted));
    // Referenced padding to avoid the mass-delete breaker.
    for (let j = 0; j < 3; j++) {
      const name = `kept-${i}-${j}.png`;
      objects.push(makeObject(name, OLD, []));
      referenced.push(`uploads/${name}`);
    }
  }

  const result = await runSweep(makeDeps(objects, referenced), {
    dryRun: false,
    log: silentLog,
  });

  assert.equal(result.abortedOnFailures, false);
  assert.equal(result.failed, MAX_CONSECUTIVE_DELETE_FAILURES);
  assert.equal(result.deleted, MAX_CONSECUTIVE_DELETE_FAILURES);
  assert.equal(result.skippedAfterAbort, 0);
});

/**
 * Build an alternating fail/success orphan list plus enough referenced
 * padding to keep the mass-delete breaker quiet.
 */
function makeAlternatingScenario(pairs: number) {
  const deleted: string[] = [];
  const attempted: string[] = [];
  const objects: StoredObject[] = [];
  const referenced: string[] = [];
  for (let i = 0; i < pairs; i++) {
    objects.push(makeFailingObject(`fail-${i}.png`, attempted));
    objects.push(makeObject(`ok-${i}.png`, OLD, deleted));
    for (let j = 0; j < 3; j++) {
      const name = `kept-${i}-${j}.png`;
      objects.push(makeObject(name, OLD, []));
      referenced.push(`uploads/${name}`);
    }
  }
  return { deleted, attempted, objects, referenced };
}

test('alternating fail/success trips the failure-rate breaker once the sample is large enough', async () => {
  // 50% failure rate > 30% limit; enough pairs to exceed the minimum sample.
  const pairs = MIN_FAILURE_RATE_SAMPLE; // 2*pairs attempts total
  const { attempted, objects, referenced } = makeAlternatingScenario(pairs);
  const errors: string[] = [];
  const log = { info: () => {}, error: (msg: string) => errors.push(msg) };

  const result = await runSweep(makeDeps(objects, referenced), { dryRun: false, log });

  assert.equal(result.abortedOnFailures, true);
  assert.match(result.abortReason ?? '', /failure-rate limit/);
  // Trips at the first failure at/after the minimum sample (alternating
  // keeps the rate at ~50% throughout).
  assert.ok(result.deleted + result.failed >= MIN_FAILURE_RATE_SAMPLE);
  assert.ok(result.deleted + result.failed < pairs * 2);
  assert.ok(result.skippedAfterAbort > 0);
  assert.ok(attempted.length < pairs);
  assert.ok(errors.some((m) => /ABORTED MID-RUN/.test(m)));
});

test('failure-rate breaker does not trip below the minimum sample size', async () => {
  // 50% failure rate, but fewer attempts than the minimum sample.
  const pairs = Math.floor((MIN_FAILURE_RATE_SAMPLE - 2) / 2);
  const { objects, referenced } = makeAlternatingScenario(pairs);

  const result = await runSweep(makeDeps(objects, referenced), {
    dryRun: false,
    log: silentLog,
  });

  assert.equal(result.abortedOnFailures, false);
  assert.equal(result.failed, pairs);
  assert.equal(result.deleted, pairs);
  assert.equal(result.skippedAfterAbort, 0);
});

test('failure-rate breaker does not trip when failures stay at or under the rate limit', async () => {
  // Exactly 30% failures at the sample boundary: not strictly greater -> no trip.
  const failures = Math.floor(MIN_FAILURE_RATE_SAMPLE * MAX_DELETE_FAILURE_RATE);
  const successes = MIN_FAILURE_RATE_SAMPLE - failures + 20;
  const deleted: string[] = [];
  const attempted: string[] = [];
  const objects: StoredObject[] = [];
  const referenced: string[] = [];
  // Interleave failures sparsely (1 failure per 5 successes-ish) so the
  // consecutive breaker never trips either.
  for (let i = 0; i < failures; i++) {
    objects.push(makeFailingObject(`fail-${i}.png`, attempted));
    for (let j = 0; j < Math.ceil(successes / failures); j++) {
      objects.push(makeObject(`ok-${i}-${j}.png`, OLD, deleted));
    }
  }
  // Referenced padding so orphans stay under the mass-delete fraction.
  const padCount = objects.length + 5;
  for (let k = 0; k < padCount; k++) {
    const name = `kept-${k}.png`;
    objects.push(makeObject(name, OLD, []));
    referenced.push(`uploads/${name}`);
  }

  const result = await runSweep(makeDeps(objects, referenced), {
    dryRun: false,
    log: silentLog,
  });

  assert.equal(result.abortedOnFailures, false);
  assert.equal(result.failed, failures);
  assert.equal(result.skippedAfterAbort, 0);
});

test('rate breaker trips on a successful attempt at the sample boundary when failures already exceed the limit', async () => {
  // Front-load enough failures to exceed 30% (but < consecutive limit runs),
  // then only successes. The trip must happen exactly when attempts reach
  // MIN_FAILURE_RATE_SAMPLE — on a *successful* delete.
  const failures = Math.floor(MIN_FAILURE_RATE_SAMPLE * MAX_DELETE_FAILURE_RATE) + 1; // 7 > 30% of 20
  assert.ok(failures < MAX_CONSECUTIVE_DELETE_FAILURES * 2);
  const deleted: string[] = [];
  const attempted: string[] = [];
  const objects: StoredObject[] = [];
  const referenced: string[] = [];
  // Interleave failures with single successes so the consecutive breaker
  // (limit 5) never trips: F F F F S F F F S ...
  let f = 0;
  while (f < failures) {
    const burst = Math.min(MAX_CONSECUTIVE_DELETE_FAILURES - 1, failures - f);
    for (let k = 0; k < burst; k++) objects.push(makeFailingObject(`fail-${f++}.png`, attempted));
    objects.push(makeObject(`ok-mid-${f}.png`, OLD, deleted));
  }
  // Pad with plenty more successes past the sample boundary.
  for (let s = 0; s < MIN_FAILURE_RATE_SAMPLE * 2; s++) {
    objects.push(makeObject(`ok-${s}.png`, OLD, deleted));
  }
  // Referenced padding to keep the mass-delete breaker quiet.
  const orphanCount = objects.length;
  for (let k = 0; k < orphanCount + 5; k++) {
    const name = `kept-${k}.png`;
    objects.push(makeObject(name, OLD, []));
    referenced.push(`uploads/${name}`);
  }

  const result = await runSweep(makeDeps(objects, referenced), {
    dryRun: false,
    log: silentLog,
  });

  assert.equal(result.abortedOnFailures, true);
  assert.match(result.abortReason ?? '', /failure-rate limit/);
  // Aborts exactly at the minimum sample boundary, not later.
  assert.equal(result.deleted + result.failed, MIN_FAILURE_RATE_SAMPLE);
  assert.equal(result.failed, failures);
  assert.ok(result.skippedAfterAbort > 0);
});

test('abort reasons distinguish consecutive-failure and failure-rate trips', async () => {
  // Consecutive trip.
  const totalFails = MAX_CONSECUTIVE_DELETE_FAILURES;
  const consecObjects: StoredObject[] = [
    ...Array.from({ length: totalFails * 3 }, (_, i) => makeObject(`kept-${i}.png`, OLD, [])),
    ...Array.from({ length: totalFails }, (_, i) => makeFailingObject(`f-${i}.png`, [])),
  ];
  const consecRefs = Array.from({ length: totalFails * 3 }, (_, i) => `uploads/kept-${i}.png`);
  const consec = await runSweep(makeDeps(consecObjects, consecRefs), {
    dryRun: false,
    log: silentLog,
  });
  assert.equal(consec.abortedOnFailures, true);
  assert.match(consec.abortReason ?? '', /consecutive delete failures/);
  assert.doesNotMatch(consec.abortReason ?? '', /failure-rate limit/);

  // Rate trip.
  const { objects, referenced } = makeAlternatingScenario(MIN_FAILURE_RATE_SAMPLE);
  const rate = await runSweep(makeDeps(objects, referenced), {
    dryRun: false,
    log: silentLog,
  });
  assert.equal(rate.abortedOnFailures, true);
  assert.match(rate.abortReason ?? '', /failure-rate limit/);
  assert.doesNotMatch(rate.abortReason ?? '', /consecutive delete failures/);
});

test('failure abort also applies during a confirmed forced mass deletion', async () => {
  const attempted: string[] = [];
  const errors: string[] = [];
  const log = { info: () => {}, error: (msg: string) => errors.push(msg) };
  const total = MAX_CONSECUTIVE_DELETE_FAILURES + 3;
  const objects = Array.from({ length: total }, (_, i) =>
    makeFailingObject(`fail-${i}.png`, attempted),
  );

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
  });

  assert.equal(attempted.length, MAX_CONSECUTIVE_DELETE_FAILURES);
  assert.equal(result.abortedOnFailures, true);
  assert.equal(result.skippedAfterAbort, total - MAX_CONSECUTIVE_DELETE_FAILURES);
  assert.ok(errors.some((m) => /ABORTED MID-RUN/.test(m)));
});

// ---------------------------------------------------------------------------
// Forced mass deletion audit trail
// ---------------------------------------------------------------------------

import type { MassDeletionAuditEntry } from './snapshotSweepCore.ts';

test('completed forced mass deletion writes an audit entry with counts and samples', async () => {
  const deleted: string[] = [];
  const audits: MassDeletionAuditEntry[] = [];
  const objects = [
    makeObject('orphan-1.png', OLD, deleted),
    makeObject('orphan-2.png', OLD, deleted),
  ];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
    confirmationMode: 'yes-flag',
    auditMassDeletion: async (entry) => {
      audits.push(entry);
    },
  });

  assert.equal(audits.length, 1);
  const entry = audits[0];
  assert.equal(entry.outcome, 'completed');
  assert.equal(entry.confirmedVia, 'yes-flag');
  assert.equal(entry.stored, 2);
  assert.equal(entry.orphans, 2);
  assert.equal(entry.deleted, 2);
  assert.equal(entry.failed, 0);
  assert.match(entry.safetyReason, /no referenced snapshots/);
  assert.deepEqual(entry.sampleNames.sort(), [
    '.private/uploads/orphan-1.png',
    '.private/uploads/orphan-2.png',
  ]);
  assert.equal(result.auditFailed, false);
});

test('declined forced mass deletion still writes an audit entry', async () => {
  const audits: MassDeletionAuditEntry[] = [];
  const objects = [
    makeObject('orphan-1.png', OLD, []),
    makeObject('orphan-2.png', OLD, []),
  ];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => false,
    confirmationMode: 'interactive',
    auditMassDeletion: async (entry) => {
      audits.push(entry);
    },
  });

  assert.equal(result.confirmationDeclined, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'declined');
  assert.equal(audits[0].confirmedVia, 'interactive');
  assert.equal(audits[0].deleted, 0);
  assert.equal(audits[0].failed, 0);
  assert.equal(audits[0].orphans, 2);
});

test('audit entry records deletion failures', async () => {
  const audits: MassDeletionAuditEntry[] = [];
  const objects: StoredObject[] = [
    makeObject('orphan-ok.png', OLD, []),
    {
      name: '.private/uploads/orphan-bad.png',
      metadata: { timeCreated: new Date(NOW - OLD).toISOString() },
      delete: async () => {
        throw new Error('storage unavailable');
      },
    },
  ];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
    auditMassDeletion: async (entry) => {
      audits.push(entry);
    },
  });

  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'completed');
  assert.equal(audits[0].deleted, 1);
  assert.equal(audits[0].failed, 1);
  assert.equal(result.failed, 1);
});

test('audit sink failure is surfaced via auditFailed and logged, without throwing', async () => {
  const errors: string[] = [];
  const log = { info: () => {}, error: (msg: string) => errors.push(msg) };
  const objects = [makeObject('orphan.png', OLD, [])];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
    auditMassDeletion: async () => {
      throw new Error('db down');
    },
  });

  assert.equal(result.auditFailed, true);
  assert.ok(errors.some((m) => /FAILED to persist forced mass deletion audit/.test(m)));
});

test('missing audit sink on a forced mass deletion sets auditFailed', async () => {
  const objects = [makeObject('orphan.png', OLD, [])];

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
  });

  assert.equal(result.auditFailed, true);
});

test('no audit entry is written for normal (non-forced) sweeps or dry-runs', async () => {
  const audits: MassDeletionAuditEntry[] = [];
  const auditMassDeletion = async (entry: MassDeletionAuditEntry) => {
    audits.push(entry);
  };

  // Normal sweep under the threshold.
  const normal = [
    makeObject('kept-1.png', OLD, []),
    makeObject('kept-2.png', OLD, []),
    makeObject('kept-3.png', OLD, []),
    makeObject('orphan.png', OLD, []),
  ];
  await runSweep(
    makeDeps(normal, ['uploads/kept-1.png', 'uploads/kept-2.png', 'uploads/kept-3.png']),
    { dryRun: false, log: silentLog, auditMassDeletion },
  );

  // Forced dry-run (nothing deleted).
  await runSweep(makeDeps([makeObject('orphan.png', OLD, [])], []), {
    dryRun: true,
    log: silentLog,
    forceMassDelete: true,
    auditMassDeletion,
  });

  assert.deepEqual(audits, []);
});

test('mid-run failure abort still writes an audit entry with outcome aborted', async () => {
  const audits: MassDeletionAuditEntry[] = [];
  const failing = (name: string): StoredObject => ({
    name: `.private/uploads/${name}`,
    metadata: { timeCreated: new Date(NOW - OLD).toISOString() },
    delete: async () => {
      throw new Error('storage unavailable');
    },
  });
  const objects = Array.from({ length: MAX_CONSECUTIVE_DELETE_FAILURES + 2 }, (_, i) =>
    failing(`orphan-${i}.png`),
  );

  const result = await runSweep(makeDeps(objects, []), {
    dryRun: false,
    log: silentLog,
    forceMassDelete: true,
    confirmMassDelete: async () => true,
    auditMassDeletion: async (entry) => {
      audits.push(entry);
    },
  });

  assert.equal(result.abortedOnFailures, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'aborted');
  assert.equal(audits[0].failed, MAX_CONSECUTIVE_DELETE_FAILURES);
});
