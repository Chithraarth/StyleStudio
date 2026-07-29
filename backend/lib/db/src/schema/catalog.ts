import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const catalogItemsTable = pgTable("catalog_items", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  styleKey: text("style_key").notNull(),
  colors: text("colors").array().notNull(),
  sizeType: text("size_type"),
});

export const insertCatalogItemSchema = createInsertSchema(
  catalogItemsTable,
).omit({ id: true });
export type InsertCatalogItem = z.infer<typeof insertCatalogItemSchema>;
export type CatalogItem = typeof catalogItemsTable.$inferSelect;
