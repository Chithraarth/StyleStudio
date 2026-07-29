/**
 * Staleness rules for the snapshot-sweep status tracker.
 *
 * Runs with Node's built-in test runner (node --test, native TS stripping):
 *   pnpm --filter @workspace/api-server run test
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  getSnapshotSweepStatus,
  markSweepSchedulerStarted,
  NEVER_RAN_GRACE_MS,
  recordNextSweepRun,
  recordSweepFailure,
  recordSweepSuccess,
  resetSnapshotSweepStatus,
  STALE_AFTER_MS,
} from './snapshotSweepStatus.ts';

const T0 = Date.parse('2026-07-23T12:00:00Z');
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  resetSnapshotSweepStatus();
});

test('fresh startup (never ran, within grace period) is not stale', () => {
  markSweepSchedulerStarted(T0);
  const status = getSnapshotSweepStatus(T0 + NEVER_RAN_GRACE_MS - 1);
  assert.equal(status.stale, false);
});

test('never ran long after startup is stale', () => {
  markSweepSchedulerStarted(T0);
  const status = getSnapshotSweepStatus(T0 + NEVER_RAN_GRACE_MS + 1);
  assert.equal(status.stale, true);
});

test('scheduler never started at all does not flag stale', () => {
  const status = getSnapshotSweepStatus(T0 + 365 * 24 * HOUR);
  assert.equal(status.stale, false);
});

test('recent successful run is not stale', () => {
  markSweepSchedulerStarted(T0);
  recordSweepSuccess(T0 + HOUR);
  const status = getSnapshotSweepStatus(T0 + HOUR + 24 * HOUR);
  assert.equal(status.stale, false);
});

test('last run older than ~2x the interval is stale', () => {
  markSweepSchedulerStarted(T0);
  recordSweepSuccess(T0 + HOUR);
  const status = getSnapshotSweepStatus(T0 + HOUR + STALE_AFTER_MS + 1);
  assert.equal(status.stale, true);
});

test('a failed run still counts as "ran" for staleness purposes', () => {
  markSweepSchedulerStarted(T0);
  recordSweepFailure('boom', T0 + NEVER_RAN_GRACE_MS + 2 * HOUR);
  const status = getSnapshotSweepStatus(T0 + NEVER_RAN_GRACE_MS + 3 * HOUR);
  assert.equal(status.stale, false);
  assert.equal(status.lastOutcome, 'failure');
});

test('aborted failure run surfaces abort flag, reason, and skipped count', () => {
  markSweepSchedulerStarted(T0);
  const status = recordSweepFailure('3 of 10 delete(s) failed; run aborted', T0 + HOUR, {
    aborted: true,
    reason: '3 consecutive delete failures',
    skippedAfterAbort: 7,
  });
  assert.equal(status.lastRunAborted, true);
  assert.equal(status.lastRunAbortReason, '3 consecutive delete failures');
  assert.equal(status.lastRunSkippedAfterAbort, 7);
  // getSnapshotSweepStatus reflects the same abort details.
  const later = getSnapshotSweepStatus(T0 + 2 * HOUR);
  assert.equal(later.lastRunAborted, true);
  assert.equal(later.lastRunSkippedAfterAbort, 7);
});

test('non-aborted run clears prior abort details', () => {
  markSweepSchedulerStarted(T0);
  recordSweepFailure('boom', T0 + HOUR, {
    aborted: true,
    reason: 'consecutive delete failures',
    skippedAfterAbort: 4,
  });
  const status = recordSweepSuccess(T0 + 2 * HOUR, { aborted: false });
  assert.equal(status.lastRunAborted, false);
  assert.equal(status.lastRunAbortReason, null);
  assert.equal(status.lastRunSkippedAfterAbort, 0);
});

test('recording without abort info resets abort fields', () => {
  markSweepSchedulerStarted(T0);
  recordSweepFailure('boom', T0 + HOUR, {
    aborted: true,
    reason: 'r',
    skippedAfterAbort: 2,
  });
  const status = recordSweepFailure('crashed', T0 + 2 * HOUR);
  assert.equal(status.lastRunAborted, false);
  assert.equal(status.lastRunAbortReason, null);
  assert.equal(status.lastRunSkippedAfterAbort, 0);
});

test('fresh status defaults abort fields to not-aborted', () => {
  const status = getSnapshotSweepStatus(T0);
  assert.equal(status.lastRunAborted, false);
  assert.equal(status.lastRunAbortReason, null);
  assert.equal(status.lastRunSkippedAfterAbort, 0);
});

test('nextRunAt is null before anything is scheduled', () => {
  markSweepSchedulerStarted(T0);
  assert.equal(getSnapshotSweepStatus(T0).nextRunAt, null);
});

test('recordNextSweepRun surfaces the next planned run time', () => {
  markSweepSchedulerStarted(T0);
  const status = recordNextSweepRun(T0 + 24 * HOUR);
  assert.equal(status.nextRunAt, new Date(T0 + 24 * HOUR).toISOString());
  assert.equal(getSnapshotSweepStatus(T0).nextRunAt, new Date(T0 + 24 * HOUR).toISOString());
});

test('rescheduling overwrites nextRunAt (e.g. 1h retry after abort)', () => {
  markSweepSchedulerStarted(T0);
  recordNextSweepRun(T0 + 24 * HOUR);
  recordSweepFailure('aborted', T0 + HOUR, { aborted: true, reason: 'r', skippedAfterAbort: 1 });
  const status = recordNextSweepRun(T0 + 2 * HOUR);
  assert.equal(status.nextRunAt, new Date(T0 + 2 * HOUR).toISOString());
});

test('reset clears nextRunAt', () => {
  recordNextSweepRun(T0 + HOUR);
  resetSnapshotSweepStatus();
  assert.equal(getSnapshotSweepStatus(T0).nextRunAt, null);
});

test('staleness recovers after a new run', () => {
  markSweepSchedulerStarted(T0);
  recordSweepSuccess(T0);
  assert.equal(getSnapshotSweepStatus(T0 + STALE_AFTER_MS + 1).stale, true);
  recordSweepSuccess(T0 + STALE_AFTER_MS + 2);
  assert.equal(getSnapshotSweepStatus(T0 + STALE_AFTER_MS + 3).stale, false);
});
