import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Permanent audit log of forced mass deletions performed by the
 * orphaned-snapshot sweep (--force-mass-delete). One row per forced run,
 * including aborted ones (declined confirmation), so incidents remain
 * diagnosable after the terminal output is gone.
 */
export const forcedMassDeletionAuditTable = pgTable(
  "forced_mass_deletion_audit",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Total stored objects under the uploads prefix at run time. */
    stored: integer("stored").notNull(),
    /** Number of objects slated for deletion. */
    orphans: integer("orphans").notNull(),
    /** Sample of object names slated for deletion. */
    sampleNames: jsonb("sample_names").$type<string[]>().notNull(),
    /** Why the circuit breaker would have tripped (the bypassed reason). */
    safetyReason: text("safety_reason").notNull(),
    /** How confirmation was (or would have been) obtained: 'interactive' | 'yes-flag'. */
    confirmedVia: text("confirmed_via").notNull(),
    /** 'declined' | 'aborted' | 'completed'. */
    outcome: text("outcome").notNull(),
    /** Objects actually deleted (0 when declined). */
    deleted: integer("deleted").notNull(),
    /** Deletions that failed (0 when declined). */
    failed: integer("failed").notNull(),
  },
);

export type ForcedMassDeletionAuditRow =
  typeof forcedMassDeletionAuditTable.$inferSelect;
