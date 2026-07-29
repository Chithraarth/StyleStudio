/**
 * Pure core of the orphaned-snapshot sweep.
 *
 * Contains all decision logic (which objects are referenced, which are old
 * enough to delete, dry-run behavior) with storage and database access
 * injected via `SweepDeps`. This keeps the safety rules unit-testable with
 * fake inputs; real wiring lives in snapshotSweep.ts.
 */
import {
  collectReferencedObjectNames,
  normalizePrivateDir,
  parseObjectPath,
} from './snapshotRefs.ts';

export { parseObjectPath };

export interface SweepLogger {
  info: (msg: string) => void;
  error: (msg: string, error?: unknown) => void;
}

export interface SweepResult {
  stored: number;
  referenced: number;
  orphans: number;
  skippedRecent: number;
  deleted: number;
  failed: number;
  dryRun: boolean;
  /** True when the mass-deletion circuit breaker aborted the sweep. */
  safetyTripped: boolean;
  /** Human-readable reason when safetyTripped is true. */
  safetyReason?: string;
  /**
   * True when the mass-deletion circuit breaker WOULD have tripped but was
   * bypassed via an explicit forceMassDelete override.
   */
  safetyOverridden: boolean;
  /**
   * True when a forced mass deletion was aborted because the operator did
   * not confirm it (no confirmation callback, or the callback declined).
   */
  confirmationDeclined: boolean;
  /**
   * True when the sweep was cut short mid-run because too many delete
   * attempts failed — either consecutively (MAX_CONSECUTIVE_DELETE_FAILURES)
   * or as an overall fraction of attempts (MAX_DELETE_FAILURE_RATE after
   * MIN_FAILURE_RATE_SAMPLE attempts). See abortReason for which limit
   * tripped.
   */
  abortedOnFailures: boolean;
  /** Human-readable reason when abortedOnFailures is true. */
  abortReason?: string;
  /** Number of orphans that were never attempted due to an early abort. */
  skippedAfterAbort: number;
  /**
   * True when a forced mass deletion happened but persisting its audit
   * entry failed. Callers should treat this as a run failure.
   */
  auditFailed: boolean;
}

/** How many object names to include in the pre-deletion preview. */
export const MASS_DELETE_PREVIEW_SAMPLE = 10;

/**
 * Preview passed to the mass-delete confirmation callback before a forced
 * mass deletion proceeds.
 */
/** How the operator confirmed (or would confirm) a forced mass deletion. */
export type MassDeleteConfirmationMode = 'interactive' | 'yes-flag';

/**
 * Audit entry persisted for every forced mass deletion attempt (including
 * aborted ones), so incidents are diagnosable after the fact.
 */
export interface MassDeletionAuditEntry {
  /** Total number of stored objects under the uploads prefix. */
  stored: number;
  /** Number of objects slated for deletion. */
  orphans: number;
  /** Why the circuit breaker would have tripped (the bypassed reason). */
  safetyReason: string;
  /** Up to MASS_DELETE_PREVIEW_SAMPLE object names slated for deletion. */
  sampleNames: string[];
  /** How confirmation was obtained (or attempted). */
  confirmedVia: MassDeleteConfirmationMode;
  /**
   * 'declined' when confirmation was refused; 'aborted' when the run was
   * cut short by consecutive delete failures; 'completed' otherwise.
   */
  outcome: 'declined' | 'aborted' | 'completed';
  /** Objects actually deleted (0 when declined). */
  deleted: number;
  /** Deletions that failed (0 when declined). */
  failed: number;
}

export interface MassDeletePreview {
  /** Total number of stored objects under the uploads prefix. */
  stored: number;
  /** Number of objects that will be deleted. */
  orphans: number;
  /** Why the circuit breaker would have tripped. */
  safetyReason: string;
  /** Up to MASS_DELETE_PREVIEW_SAMPLE object names slated for deletion. */
  sampleNames: string[];
}

/**
 * Objects created within this window are never deleted, even when
 * unreferenced. This protects fresh uploads whose look row hasn't been
 * saved yet (upload finished, save request still in flight).
 */
export const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Mass-deletion circuit breaker: if the sweep would delete more than this
 * fraction of all stored objects, something is likely wrong (empty/wrong
 * database, mid-flight migration), so the sweep aborts instead of deleting.
 */
export const MAX_DELETE_FRACTION = 0.5;

/**
 * Mid-run failure circuit breaker: abort the sweep once this many delete
 * attempts fail *consecutively*. Storage that fails several deletes in a row
 * is likely misbehaving; keep hammering it teaches us nothing.
 */
export const MAX_CONSECUTIVE_DELETE_FAILURES = 5;

/**
 * Mid-run failure-rate circuit breaker: abort the sweep when more than this
 * fraction of delete attempts have failed overall, once at least
 * MIN_FAILURE_RATE_SAMPLE attempts were made. Catches flaky storage that
 * fails frequently but not consecutively (e.g. every other delete), which
 * the consecutive counter never trips on.
 */
export const MAX_DELETE_FAILURE_RATE = 0.3;

/**
 * Minimum number of delete attempts before the failure-rate breaker is
 * evaluated, so a couple of early failures don't abort a large run.
 */
export const MIN_FAILURE_RATE_SAMPLE = 20;

/** Minimal shape of a stored object, matching @google-cloud/storage File. */
export interface StoredObject {
  name: string;
  metadata?: { timeCreated?: string };
  delete: () => Promise<unknown>;
}

export interface SweepDeps {
  /** Private object dir, e.g. "/bucket/.private" (trailing slash ok). */
  getPrivateObjectDir: () => string;
  /** snapshotDataUrl values of all looks that have one (non-null). */
  getReferencedSnapshotUrls: () => Promise<string[]>;
  /** List stored objects under the given bucket/prefix. */
  listObjects: (bucketName: string, prefix: string) => Promise<StoredObject[]>;
  /** Current time in ms; injectable for tests. Defaults to Date.now(). */
  now?: () => number;
}


export async function runSweep(
  deps: SweepDeps,
  options: {
    dryRun: boolean;
    log: SweepLogger;
    /**
     * Explicit operator override for the mass-deletion circuit breaker.
     * Must only be settable from the manual admin script (--force-mass-delete);
     * the recurring scheduler must never pass this.
     */
    forceMassDelete?: boolean;
    /**
     * Required to actually delete when forceMassDelete bypasses the circuit
     * breaker (and not in dry-run). Receives a preview of what will be
     * deleted and must resolve true to proceed. If omitted or it resolves
     * false, the sweep aborts without deleting anything.
     */
    confirmMassDelete?: (preview: MassDeletePreview) => Promise<boolean>;
    /**
     * How the operator confirms forced mass deletions ('interactive' vs
     * '--yes'). Recorded in the audit entry. Defaults to 'interactive'.
     */
    confirmationMode?: MassDeleteConfirmationMode;
    /**
     * Persists a permanent audit entry for every forced mass deletion
     * attempt (declined or completed). Required by the admin script;
     * failures are logged and surfaced via result.auditFailed.
     */
    auditMassDeletion?: (entry: MassDeletionAuditEntry) => Promise<void>;
  },
): Promise<SweepResult> {
  const {
    dryRun,
    log,
    forceMassDelete = false,
    confirmMassDelete,
    confirmationMode = 'interactive',
    auditMassDeletion,
  } = options;
  const now = deps.now ?? (() => Date.now());

  const privateDir = normalizePrivateDir(deps.getPrivateObjectDir());

  const uploadsPrefixPath = `${privateDir}/uploads/`;
  const { bucketName, objectName: uploadsPrefix } = parseObjectPath(uploadsPrefixPath);

  // 1. Collect referenced object names from looks.snapshotDataUrl.
  const urls = await deps.getReferencedSnapshotUrls();
  const referenced = collectReferencedObjectNames(privateDir, urls);

  // 2. List stored objects under the uploads prefix.
  const files = await deps.listObjects(bucketName, uploadsPrefix);

  log.info(
    `Found ${files.length} stored object(s) under gs://${bucketName}/${uploadsPrefix}, ` +
      `${referenced.size} referenced by looks.`,
  );

  const unreferenced = files.filter((f) => !referenced.has(f.name));

  // 3. Skip recently created objects: a fresh upload may not yet be
  //    referenced because the look save request is still in flight.
  const nowMs = now();
  const orphans: typeof unreferenced = [];
  let skippedRecent = 0;
  for (const file of unreferenced) {
    const timeCreated = file.metadata?.timeCreated;
    const createdMs = timeCreated ? new Date(timeCreated).getTime() : NaN;
    if (!Number.isFinite(createdMs) || nowMs - createdMs < MIN_ORPHAN_AGE_MS) {
      // Missing/unparseable timestamps are treated as recent (safe default).
      skippedRecent += 1;
      continue;
    }
    orphans.push(file);
  }

  if (skippedRecent > 0) {
    log.info(
      `Skipped ${skippedRecent} unreferenced object(s) newer than ` +
        `${MIN_ORPHAN_AGE_MS / 3_600_000}h (possible in-flight uploads).`,
    );
  }

  const result: SweepResult = {
    stored: files.length,
    referenced: referenced.size,
    orphans: orphans.length,
    skippedRecent,
    deleted: 0,
    failed: 0,
    dryRun,
    safetyTripped: false,
    safetyOverridden: false,
    confirmationDeclined: false,
    abortedOnFailures: false,
    skippedAfterAbort: 0,
    auditFailed: false,
  };

  /** Set when a forced mass deletion (outside dry-run) is in progress. */
  let pendingAudit:
    | Pick<MassDeletionAuditEntry, 'stored' | 'orphans' | 'safetyReason' | 'sampleNames'>
    | undefined;

  const writeAudit = async (
    outcome: MassDeletionAuditEntry['outcome'],
  ): Promise<void> => {
    if (!pendingAudit) return;
    const entry: MassDeletionAuditEntry = {
      ...pendingAudit,
      confirmedVia: confirmationMode,
      outcome,
      deleted: result.deleted,
      failed: result.failed,
    };
    if (!auditMassDeletion) {
      result.auditFailed = true;
      log.error(
        'AUDIT MISSING: no auditMassDeletion sink was provided for a forced mass deletion.',
      );
      return;
    }
    try {
      await auditMassDeletion(entry);
      log.info(
        `Audit entry recorded for forced mass deletion (outcome: ${outcome}).`,
      );
    } catch (error) {
      result.auditFailed = true;
      log.error('FAILED to persist forced mass deletion audit entry', error);
    }
  };

  // Mass-deletion circuit breaker: abort before deleting anything when the
  // database's reference list looks implausible relative to storage.
  if (orphans.length > 0) {
    let safetyReason: string | undefined;
    if (referenced.size === 0 && files.length > 0) {
      safetyReason =
        `no referenced snapshots found in the database while ${files.length} object(s) ` +
        `exist in storage (possible empty/wrong database or mid-flight migration)`;
    } else if (orphans.length > files.length * MAX_DELETE_FRACTION) {
      safetyReason =
        `sweep would delete ${orphans.length} of ${files.length} stored object(s), ` +
        `exceeding the ${MAX_DELETE_FRACTION * 100}% mass-deletion threshold`;
    }
    if (safetyReason) {
      if (forceMassDelete) {
        result.safetyOverridden = true;
        result.safetyReason = safetyReason;
        log.error(
          `SAFETY OVERRIDE: --force-mass-delete is set — proceeding despite circuit ` +
            `breaker (${safetyReason}). This bypass was explicitly requested by an operator.`,
        );
        if (!dryRun) {
          // Show exactly what is about to be deleted, then require explicit
          // confirmation before a forced mass deletion proceeds.
          const sampleNames = orphans
            .slice(0, MASS_DELETE_PREVIEW_SAMPLE)
            .map((f) => f.name);
          log.info(
            `About to PERMANENTLY delete ${orphans.length} of ${files.length} stored ` +
              `object(s) in gs://${bucketName}:`,
          );
          for (const name of sampleNames) {
            log.info(`  - gs://${bucketName}/${name}`);
          }
          if (orphans.length > sampleNames.length) {
            log.info(`  ... and ${orphans.length - sampleNames.length} more`);
          }
          pendingAudit = {
            stored: files.length,
            orphans: orphans.length,
            safetyReason,
            sampleNames,
          };
          const confirmed = confirmMassDelete
            ? await confirmMassDelete({
                stored: files.length,
                orphans: orphans.length,
                safetyReason,
                sampleNames,
              })
            : false;
          if (!confirmed) {
            result.confirmationDeclined = true;
            log.error(
              'ABORTED: forced mass deletion was not confirmed. No objects were deleted. ' +
                'Re-run and confirm interactively, or pass --yes for non-interactive use.',
            );
            await writeAudit('declined');
            return result;
          }
        }
      } else {
        result.safetyTripped = true;
        result.safetyReason = safetyReason;
        log.error(`SAFETY TRIP: sweep aborted — ${safetyReason}. No objects were deleted.`);
        return result;
      }
    }
  }

  if (orphans.length === 0) {
    log.info('No orphaned objects found. Nothing to do.');
    return result;
  }

  let consecutiveFailures = 0;
  for (let i = 0; i < orphans.length; i++) {
    const file = orphans[i];
    if (dryRun) {
      log.info(`[dry-run] would delete gs://${bucketName}/${file.name}`);
      continue;
    }
    try {
      await file.delete();
      result.deleted += 1;
      consecutiveFailures = 0;
      log.info(`deleted gs://${bucketName}/${file.name}`);
    } catch (error) {
      result.failed += 1;
      consecutiveFailures += 1;
      log.error(`FAILED to delete gs://${bucketName}/${file.name}`, error);
    }
    // Evaluate both failure breakers after every attempt (success or
    // failure): the rate breaker must trip as soon as the minimum sample is
    // reached, even if the attempt that crossed the boundary succeeded.
    const attempts = result.deleted + result.failed;
    let abortReason: string | undefined;
    if (consecutiveFailures >= MAX_CONSECUTIVE_DELETE_FAILURES) {
      abortReason =
        `${consecutiveFailures} consecutive delete failures reached the ` +
        `${MAX_CONSECUTIVE_DELETE_FAILURES}-failure limit (storage likely misbehaving)`;
    } else if (
      attempts >= MIN_FAILURE_RATE_SAMPLE &&
      result.failed > attempts * MAX_DELETE_FAILURE_RATE
    ) {
      abortReason =
        `${result.failed} of ${attempts} delete attempts failed, exceeding the ` +
        `${MAX_DELETE_FAILURE_RATE * 100}% failure-rate limit ` +
        `(storage likely flaky)`;
    }
    if (abortReason) {
      result.abortedOnFailures = true;
      result.skippedAfterAbort = orphans.length - (i + 1);
      result.abortReason = abortReason;
      log.error(
        `ABORTED MID-RUN: sweep stopped after ${result.abortReason}. ` +
          `Deleted ${result.deleted}, failed ${result.failed}, ` +
          `${result.skippedAfterAbort} orphan(s) left unattempted.`,
      );
      await writeAudit('aborted');
      return result;
    }
  }

  if (dryRun) {
    log.info(
      `[dry-run] ${orphans.length} orphaned object(s) would be deleted. ` +
        `Re-run with --delete to remove them.`,
    );
  } else {
    log.info(`Deleted ${result.deleted} orphaned object(s); ${result.failed} failure(s).`);
  }

  await writeAudit('completed');

  return result;
}
