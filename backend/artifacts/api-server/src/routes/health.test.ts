/**
 * Endpoint-level contract test for /healthz.
 *
 * Ensures the serialized health payload (which passes through the shared
 * zod schema, stripping unknown keys) actually includes the abort details
 * from the last sweep run — not just the in-memory status object.
 *
 * Runs with Node's built-in test runner (node --test, native TS stripping):
 *   pnpm --filter @workspace/api-server run test
 */
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import express from 'express';

import {
  markSweepSchedulerStarted,
  recordSweepFailure,
  recordSweepSuccess,
  resetSnapshotSweepStatus,
} from '../lib/snapshotSweepStatus.ts';
import healthRouter from './health.ts';

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use('/api', healthRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  resetSnapshotSweepStatus();
});

async function getHealth(): Promise<Record<string, any>> {
  const res = await fetch(`${baseUrl}/api/healthz`);
  assert.equal(res.status, 200);
  return (await res.json()) as Record<string, any>;
}

test('/healthz surfaces abort flag, reason, and skipped count after an aborted run', async () => {
  markSweepSchedulerStarted();
  recordSweepFailure('3 of 10 orphaned object delete(s) failed; run aborted mid-run', Date.now(), {
    aborted: true,
    reason: '3 consecutive delete failures',
    skippedAfterAbort: 7,
  });

  const body = await getHealth();
  assert.equal(body['snapshotSweep'].lastRunAborted, true);
  assert.equal(body['snapshotSweep'].lastRunAbortReason, '3 consecutive delete failures');
  assert.equal(body['snapshotSweep'].lastRunSkippedAfterAbort, 7);
});

test('/healthz reports not-aborted after a clean run', async () => {
  markSweepSchedulerStarted();
  recordSweepSuccess(Date.now(), { aborted: false });

  const body = await getHealth();
  assert.equal(body['snapshotSweep'].lastRunAborted, false);
  assert.equal(body['snapshotSweep'].lastRunAbortReason, null);
  assert.equal(body['snapshotSweep'].lastRunSkippedAfterAbort, 0);
});
