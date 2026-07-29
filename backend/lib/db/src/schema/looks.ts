import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { avatarsTable } from "./avatars";

export type LookSelections = {
  hairstyleItemId?: number | null;
  hairstyleColor?: string | null;
  beardItemId?: number | null;
  beardColor?: string | null;
  shirtItemId?: number | null;
  shirtColor?: string | null;
  pantsItemId?: number | null;
  pantsColor?: string | null;
  shoesItemId?: number | null;
  shoesColor?: string | null;
  skinTone?: string | null;
  eyebrowStyle?: string | null;
  eyebrowColor?: string | null;
  shirtTextureUrl?: string | null;
  pantsTextureUrl?: string | null;
  shoesTextureUrl?: string | null;
  hatTextureUrl?: string | null;
  glassesTextureUrl?: string | null;
};

export const looksTable = pgTable("looks", {
  id: serial("id").primaryKey(),
  avatarId: integer("avatar_id")
    .notNull()
    .references(() => avatarsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  selections: jsonb("selections").$type<LookSelections>().notNull(),
  // Snapshot reference: new rows store an object-storage path ("/objects/...")
  // served via /api/storage; legacy rows may still hold base64 data URLs.
  snapshotDataUrl: text("snapshot_data_url"),
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertLookSchema = createInsertSchema(looksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLook = z.infer<typeof insertLookSchema>;
export type Look = typeof looksTable.$inferSelect;
