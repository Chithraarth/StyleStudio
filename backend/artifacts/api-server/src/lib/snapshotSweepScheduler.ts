/**
 * Recurring in-process scheduler for the orphaned snapshot sweep.
 *
 * Runs the sweep shortly after server startup and then once every 24 hours.
 * When a run aborts mid-run due to repeated delete failures, the next run is
 * retried sooner (see snapshotSweepReschedule.ts) so transient hiccups don't
 * leave orphans waiting a full day.
 * In production the sweep actually deletes orphans; in development it runs
 * in dry-run mode so local data is never touched unexpectedly.
 */
import type { Logger } from 'pino';

import { sweepOrphanedSnapshots } from './snapshotSweep';
import {
  computeNextSweepDelayMs,
  SWEEP_INTERVAL_MS,
} from './snapshotSweepReschedule';
import {
  markSweepSchedulerStarted,
  recordNextSweepRun,
  recordSweepFailure,
  recordSweepSuccess,
} from './snapshotSweepStatus';

const STARTUP_DELAY_MS = 60 * 1000; // let the server settle before the first run

export function startSnapshotSweepScheduler(logger: Logger): void {
  const dryRun = process.env['NODE_ENV'] !== 'production';
  const log = logger.child({ job: 'snapshot-sweep' });

  markSweepSchedulerStarted();

  /** Runs one sweep and returns whether it aborted mid-run on failures. */
  const runSweep = async (): Promise<boolean> => {
    log.info({ dryRun }, 'Starting scheduled orphaned-snapshot sweep');
    try {
      const result = await sweepOrphanedSnapshots({
        dryRun,
        log: {
          info: (msg) => log.info(msg),
          error: (msg, error) => log.error({ err: error }, msg),
        },
      });
      const abortInfo = {
        aborted: result.abortedOnFailures,
        reason: result.abortReason,
        skippedAfterAbort: result.skippedAfterAbort,
      };
      if (result.failed > 0) {
        const status = recordSweepFailure(
          result.abortedOnFailures
            ? `${result.failed} of ${result.orphans} orphaned object delete(s) failed; run aborted mid-run (${result.skippedAfterAbort} orphan(s) left unattempted)`
            : `${result.failed} of ${result.orphans} orphaned object delete(s) failed`,
          Date.now(),
          abortInfo,
        );
        log.error(
          { result, sweepStatus: status },
          status.alerting
            ? 'ALERT: orphaned-snapshot sweep is failing repeatedly — object-storage deletes keep failing (check credentials/permissions)'
            : 'Scheduled orphaned-snapshot sweep finished with delete failures',
        );
      } else {
        recordSweepSuccess(Date.now(), abortInfo);
        log.info({ result }, 'Scheduled orphaned-snapshot sweep finished');
      }
      return result.abortedOnFailures;
    } catch (error) {
      const status = recordSweepFailure(
        error instanceof Error ? error.message : String(error),
      );
      log.error(
        { err: error, sweepStatus: status },
        status.alerting
          ? 'ALERT: orphaned-snapshot sweep is failing repeatedly — sweep has not completed successfully in multiple runs'
          : 'Scheduled orphaned-snapshot sweep failed',
      );
      return false;
    }
  };

  const scheduleNext = (delayMs: number) => {
    recordNextSweepRun(Date.now() + delayMs);
    const timer = setTimeout(() => {
      void runSweep().then((abortedOnFailures) => {
        const nextDelayMs = computeNextSweepDelayMs(abortedOnFailures);
        if (abortedOnFailures) {
          log.warn(
            { nextRunInMinutes: nextDelayMs / 60_000 },
            'Sweep aborted mid-run; retrying sooner than the normal interval',
          );
        }
        scheduleNext(nextDelayMs);
      });
    }, delayMs);
    timer.unref();
  };

  scheduleNext(STARTUP_DELAY_MS);

  log.info(
    { dryRun, intervalHours: SWEEP_INTERVAL_MS / 3_600_000 },
    'Snapshot sweep scheduler started',
  );
}
