import {
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const avatarsTable = pgTable("avatars", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  bodyType: text("body_type").notNull(),
  facePhotoUrl: text("face_photo_url"),
  skinTone: text("skin_tone"),
  heightCm: real("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  chestCm: real("chest_cm"),
  waistCm: real("waist_cm"),
  hipCm: real("hip_cm"),
  inseamCm: real("inseam_cm"),
  shoulderCm: real("shoulder_cm"),
  neckCm: real("neck_cm"),
  shoeSizeEu: real("shoe_size_eu"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAvatarSchema = createInsertSchema(avatarsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAvatar = z.infer<typeof insertAvatarSchema>;
export type Avatar = typeof avatarsTable.$inferSelect;
