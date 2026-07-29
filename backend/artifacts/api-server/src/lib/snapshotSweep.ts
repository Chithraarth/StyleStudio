/**
 * Sweep logic that deletes stored snapshot objects under the private
 * uploads dir that no look's snapshotDataUrl references anymore.
 *
 * Used by the one-off admin script (src/scripts/sweepOrphanedSnapshots.ts)
 * and by the recurring in-process scheduler started from src/index.ts.
 *
 * All decision logic (safety rules included) lives in snapshotSweepCore.ts,
 * which is unit-tested with fake inputs; this module only wires the real
 * database and object storage into it.
 */
import { isNotNull } from 'drizzle-orm';
import { db, forcedMassDeletionAuditTable, looksTable } from '@workspace/db';

import { ObjectStorageService, objectStorageClient } from './objectStorage';
import {
  runSweep,
  type MassDeleteConfirmationMode,
  type MassDeletePreview,
  type SweepLogger,
  type SweepResult,
} from './snapshotSweepCore';

export { MIN_ORPHAN_AGE_MS } from './snapshotSweepCore';
export type { MassDeletePreview, SweepLogger, SweepResult };

export async function sweepOrphanedSnapshots(options: {
  dryRun: boolean;
  log: SweepLogger;
  /**
   * Explicit operator override for the mass-deletion circuit breaker.
   * Only the manual admin script may set this (via --force-mass-delete);
   * the recurring scheduler must never pass it.
   */
  forceMassDelete?: boolean;
  /**
   * Confirmation gate for forced mass deletions. Required for the deletion
   * to proceed when forceMassDelete bypasses the circuit breaker outside
   * dry-run; only the manual admin script should provide it.
   */
  confirmMassDelete?: (preview: MassDeletePreview) => Promise<boolean>;
  /**
   * How forced mass deletions are confirmed ('interactive' vs '--yes').
   * Recorded in the permanent audit entry.
   */
  confirmationMode?: MassDeleteConfirmationMode;
}): Promise<SweepResult> {
  return runSweep(
    {
      getPrivateObjectDir: () => new ObjectStorageService().getPrivateObjectDir(),
      getReferencedSnapshotUrls: async () => {
        const rows = await db
          .select({ snapshotDataUrl: looksTable.snapshotDataUrl })
          .from(looksTable)
          .where(isNotNull(looksTable.snapshotDataUrl));
        return rows
          .map((row) => row.snapshotDataUrl)
          .filter((url): url is string => url != null);
      },
      listObjects: async (bucketName, prefix) => {
        const [files] = await objectStorageClient.bucket(bucketName).getFiles({ prefix });
        return files;
      },
    },
    {
      ...options,
      auditMassDeletion: async (entry) => {
        await db.insert(forcedMassDeletionAuditTable).values({
          stored: entry.stored,
          orphans: entry.orphans,
          sampleNames: entry.sampleNames,
          safetyReason: entry.safetyReason,
          confirmedVia: entry.confirmedVia,
          outcome: entry.outcome,
          deleted: entry.deleted,
          failed: entry.failed,
        });
      },
    },
  );
}
