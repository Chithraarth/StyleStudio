/**
 * Unit tests for the sweep rescheduling logic.
 *
 * Runs with Node's built-in test runner (node --test, native TS stripping):
 *   pnpm --filter @workspace/api-server run test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ABORTED_RETRY_DELAY_MS,
  SWEEP_INTERVAL_MS,
  computeNextSweepDelayMs,
} from './snapshotSweepReschedule.ts';

test('aborted run schedules a short retry instead of the daily interval', () => {
  assert.equal(computeNextSweepDelayMs(true), ABORTED_RETRY_DELAY_MS);
  assert.ok(
    ABORTED_RETRY_DELAY_MS < SWEEP_INTERVAL_MS,
    'retry delay must be shorter than the normal interval',
  );
});

test('retry delay is about an hour, not another full day', () => {
  assert.equal(ABORTED_RETRY_DELAY_MS, 60 * 60 * 1000);
});

test('non-aborted run resumes the normal daily cadence', () => {
  assert.equal(computeNextSweepDelayMs(false), SWEEP_INTERVAL_MS);
  assert.equal(SWEEP_INTERVAL_MS, 24 * 60 * 60 * 1000);
});
