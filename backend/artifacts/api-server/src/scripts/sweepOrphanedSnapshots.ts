/**
 * One-off admin sweep: deletes stored snapshot objects under the private
 * uploads dir that no look's snapshotDataUrl references anymore.
 *
 * Usage (from artifacts/api-server):
 *   pnpm run sweep:snapshots           # dry-run (default): prints what would be deleted
 *   pnpm run sweep:snapshots -- --delete   # actually deletes orphaned objects
 *   pnpm run sweep:snapshots -- --delete --force-mass-delete
 *       # DANGER: bypasses the mass-deletion circuit breaker. Prints a preview
 *       # of what will be deleted and asks for interactive confirmation first.
 *   pnpm run sweep:snapshots -- --delete --force-mass-delete --yes
 *       # Non-interactive: skips the confirmation prompt. Use with extreme care.
 */
import { createInterface } from 'node:readline/promises';

import { pool } from '@workspace/db';

import { sweepOrphanedSnapshots } from '../lib/snapshotSweep';

async function promptForConfirmation(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(
      'Refusing to proceed: no interactive terminal to confirm the forced mass ' +
        'deletion. Re-run from a terminal, or pass --yes to skip the prompt.',
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Type 'delete' to confirm the forced mass deletion (anything else aborts): ",
    );
    return answer.trim().toLowerCase() === 'delete';
  } finally {
    rl.close();
  }
}

async function main() {
  const dryRun = !process.argv.includes('--delete');
  const forceMassDelete = process.argv.includes('--force-mass-delete');
  const assumeYes = process.argv.includes('--yes');
  if (forceMassDelete) {
    console.warn(
      'WARNING: --force-mass-delete is set. The mass-deletion circuit breaker ' +
        'will be BYPASSED and a large fraction of stored objects may be deleted.',
    );
  }
  const result = await sweepOrphanedSnapshots({
    dryRun,
    forceMassDelete,
    confirmMassDelete: async (preview) => {
      if (assumeYes) {
        console.warn(
          `--yes is set: skipping confirmation for deleting ${preview.orphans} object(s).`,
        );
        return true;
      }
      return promptForConfirmation();
    },
    confirmationMode: assumeYes ? 'yes-flag' : 'interactive',
    log: {
      info: (msg) => console.log(msg),
      error: (msg, error) => (error === undefined ? console.error(msg) : console.error(`${msg}:`, error)),
    },
  });
  if (result.failed > 0 || result.confirmationDeclined || result.auditFailed) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
