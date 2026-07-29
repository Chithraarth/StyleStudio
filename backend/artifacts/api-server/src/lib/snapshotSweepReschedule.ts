/**
 * Pure rescheduling logic for the orphaned-snapshot sweep scheduler.
 *
 * Normally the sweep runs once every 24 hours. But when a run aborts mid-run
 * due to repeated delete failures (often a transient credential/network
 * hiccup), the leftover orphans shouldn't have to wait a full day: the next
 * run is scheduled after a much shorter retry delay instead. Once a run
 * completes without aborting, the normal daily cadence resumes.
 *
 * Kept free of timers and I/O so it can be unit-tested directly.
 */

export const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day
export const ABORTED_RETRY_DELAY_MS = 60 * 60 * 1000; // retry in 1 hour

/**
 * Delay until the next sweep run, based on how the previous run ended.
 *
 * @param abortedOnFailures true when the run stopped early because deletes
 *   kept failing (leaving orphans unattempted).
 */
export function computeNextSweepDelayMs(abortedOnFailures: boolean): number {
  return abortedOnFailures ? ABORTED_RETRY_DELAY_MS : SWEEP_INTERVAL_MS;
}
