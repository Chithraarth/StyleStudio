/**
 * Admin-only audit review: prints recent forced mass-deletion audit entries
 * from the forced_mass_deletion_audit table, so incidents can be reviewed
 * without hand-written SQL. Read-only; runs from the shell (never exposed
 * via the HTTP API).
 *
 * Usage (from artifacts/api-server):
 *   pnpm run audit:forced-deletions              # last 20 entries
 *   pnpm run audit:forced-deletions -- --limit 50
 *   pnpm run audit:forced-deletions -- --json    # machine-readable output
 */
import { desc } from 'drizzle-orm';
import { db, forcedMassDeletionAuditTable, pool } from '@workspace/db';

function parseLimit(argv: string[]): number {
  const idx = argv.indexOf('--limit');
  if (idx === -1) return 20;
  const raw = argv[idx + 1];
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error(`--limit must be an integer between 1 and 500 (got ${raw ?? 'nothing'})`);
  }
  return parsed;
}

async function main() {
  const limit = parseLimit(process.argv);
  const asJson = process.argv.includes('--json');

  const rows = await db
    .select()
    .from(forcedMassDeletionAuditTable)
    .orderBy(desc(forcedMassDeletionAuditTable.createdAt), desc(forcedMassDeletionAuditTable.id))
    .limit(limit);

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log('No forced mass-deletion audit entries found.');
    return;
  }

  console.log(`Most recent ${rows.length} forced mass-deletion audit entr${rows.length === 1 ? 'y' : 'ies'} (newest first):\n`);
  for (const row of rows) {
    console.log(`#${row.id}  ${row.createdAt.toISOString()}  outcome=${row.outcome}`);
    console.log(`    stored=${row.stored}  orphans=${row.orphans}  deleted=${row.deleted}  failed=${row.failed}`);
    console.log(`    confirmed via: ${row.confirmedVia}`);
    console.log(`    safety reason: ${row.safetyReason}`);
    const sample = row.sampleNames;
    if (sample.length > 0) {
      console.log(`    sample object names (${sample.length}):`);
      for (const name of sample) {
        console.log(`      - ${name}`);
      }
    } else {
      console.log('    sample object names: (none recorded)');
    }
    console.log('');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
