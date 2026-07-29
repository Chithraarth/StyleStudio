/**
 * In-memory status tracker for the recurring orphaned-snapshot sweep.
 *
 * The scheduler records the outcome of each run here; the /healthz endpoint
 * exposes the current status so repeated background failures (expired
 * credentials, permission changes) become visible instead of only living in
 * per-run log lines.
 *
 * A single transient failure does not alarm; `alerting` only flips once
 * ALERT_AFTER_CONSECUTIVE_FAILURES runs in a row have failed.
 *
 * Separately from failures, `stale` flags when the sweep has not run *at all*
 * for too long — e.g. the scheduler's timer never fires, or crash-loop
 * restarts keep resetting it before the 24h interval elapses. The reported
 * status is stale when:
 *  - the last run is older than STALE_AFTER_MS (~2x the sweep interval), or
 *  - the sweep has never run and the scheduler started more than
 *    NEVER_RAN_GRACE_MS ago (fresh startups don't false-alarm).
 */

export const ALERT_AFTER_CONSECUTIVE_FAILURES = 2;

/** Sweep runs every 24h; consider it stale after ~2x that. */
export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/** Grace period after startup before a never-ran sweep counts as stale. */
export const NEVER_RAN_GRACE_MS = 60 * 60 * 1000; // 1 hour

export interface SnapshotSweepStatus {
  /** ISO timestamp of the most recent run, or null before the first run. */
  lastRunAt: string | null;
  lastOutcome: 'success' | 'failure' | null;
  /** Short description of the most recent failure, cleared on success. */
  lastError: string | null;
  consecutiveFailures: number;
  /** True once failures are sustained (>= ALERT_AFTER_CONSECUTIVE_FAILURES). */
  alerting: boolean;
  /** True when the sweep hasn't run for far longer than its interval. */
  stale: boolean;
  /** True when the most recent run aborted mid-run due to repeated failures. */
  lastRunAborted: boolean;
  /** Why the last run aborted, or null when it did not abort. */
  lastRunAbortReason: string | null;
  /** Orphans left unattempted when the last run aborted (0 otherwise). */
  lastRunSkippedAfterAbort: number;
  /** ISO timestamp of the next planned run, or null when none is scheduled. */
  nextRunAt: string | null;
}

/** Abort details from the most recent sweep run, surfaced in health data. */
export interface SweepAbortInfo {
  aborted: boolean;
  reason?: string;
  skippedAfterAbort?: number;
}

interface MutableState {
  lastRunAt: string | null;
  lastOutcome: 'success' | 'failure' | null;
  lastError: string | null;
  consecutiveFailures: number;
  alerting: boolean;
  /** Epoch ms when the scheduler started, or null if it never started. */
  schedulerStartedAtMs: number | null;
  lastRunAborted: boolean;
  lastRunAbortReason: string | null;
  lastRunSkippedAfterAbort: number;
  nextRunAt: string | null;
}

const state: MutableState = {
  lastRunAt: null,
  lastOutcome: null,
  lastError: null,
  consecutiveFailures: 0,
  alerting: false,
  schedulerStartedAtMs: null,
  lastRunAborted: false,
  lastRunAbortReason: null,
  lastRunSkippedAfterAbort: 0,
  nextRunAt: null,
};

function applyAbortInfo(abort: SweepAbortInfo | undefined): void {
  if (abort?.aborted) {
    state.lastRunAborted = true;
    state.lastRunAbortReason = abort.reason ?? null;
    state.lastRunSkippedAfterAbort = abort.skippedAfterAbort ?? 0;
  } else {
    state.lastRunAborted = false;
    state.lastRunAbortReason = null;
    state.lastRunSkippedAfterAbort = 0;
  }
}

/** Called by the scheduler on startup so "never ran" staleness can be timed. */
export function markSweepSchedulerStarted(nowMs: number = Date.now()): void {
  state.schedulerStartedAtMs = nowMs;
}

/**
 * Called by the scheduler whenever the next run is (re)scheduled so health
 * data can show when the sweep will run next — e.g. to confirm the faster
 * 1h retry after an aborted run actually kicked in.
 */
export function recordNextSweepRun(nextRunAtMs: number): SnapshotSweepStatus {
  state.nextRunAt = new Date(nextRunAtMs).toISOString();
  return snapshot(Date.now());
}

function computeStale(nowMs: number): boolean {
  if (state.lastRunAt !== null) {
    const lastRunMs = Date.parse(state.lastRunAt);
    // An unparseable timestamp shouldn't happen; treat it as stale so it
    // surfaces rather than silently passing health checks forever.
    if (Number.isNaN(lastRunMs)) return true;
    return nowMs - lastRunMs > STALE_AFTER_MS;
  }
  // Never ran: only stale once we're well past the startup grace period.
  if (state.schedulerStartedAtMs === null) return false;
  return nowMs - state.schedulerStartedAtMs > NEVER_RAN_GRACE_MS;
}

function snapshot(nowMs: number): SnapshotSweepStatus {
  return {
    lastRunAt: state.lastRunAt,
    lastOutcome: state.lastOutcome,
    lastError: state.lastError,
    consecutiveFailures: state.consecutiveFailures,
    alerting: state.alerting,
    stale: computeStale(nowMs),
    lastRunAborted: state.lastRunAborted,
    lastRunAbortReason: state.lastRunAbortReason,
    lastRunSkippedAfterAbort: state.lastRunSkippedAfterAbort,
    nextRunAt: state.nextRunAt,
  };
}

export function recordSweepSuccess(
  nowMs: number = Date.now(),
  abort?: SweepAbortInfo,
): SnapshotSweepStatus {
  state.lastRunAt = new Date(nowMs).toISOString();
  state.lastOutcome = 'success';
  state.lastError = null;
  state.consecutiveFailures = 0;
  state.alerting = false;
  applyAbortInfo(abort);
  return snapshot(nowMs);
}

export function recordSweepFailure(
  error: string,
  nowMs: number = Date.now(),
  abort?: SweepAbortInfo,
): SnapshotSweepStatus {
  state.lastRunAt = new Date(nowMs).toISOString();
  state.lastOutcome = 'failure';
  state.lastError = error;
  applyAbortInfo(abort);
  state.consecutiveFailures += 1;
  state.alerting = state.consecutiveFailures >= ALERT_AFTER_CONSECUTIVE_FAILURES;
  return snapshot(nowMs);
}

export function getSnapshotSweepStatus(nowMs: number = Date.now()): SnapshotSweepStatus {
  return snapshot(nowMs);
}

/** Test-only helper to reset module state. */
export function resetSnapshotSweepStatus(): void {
  state.lastRunAt = null;
  state.lastOutcome = null;
  state.lastError = null;
  state.consecutiveFailures = 0;
  state.alerting = false;
  state.schedulerStartedAtMs = null;
  state.lastRunAborted = false;
  state.lastRunAbortReason = null;
  state.lastRunSkippedAfterAbort = 0;
  state.nextRunAt = null;
}
