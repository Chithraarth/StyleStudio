import type { Request, Response } from "express";
import { asc } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

type LocalUser = typeof usersTable.$inferSelect;

/**
 * No real auth provider is wired up right now (Clerk was removed; Firebase
 * auth is a planned follow-up). Every request resolves to the same single
 * auto-provisioned local user, so the rest of the app (avatar/look ownership
 * checks, "my" endpoints) keeps working end-to-end in the meantime — this
 * mirrors routes/storage.ts, which already documents having no auth layer.
 *
 * Replace this with real per-request identity resolution (Firebase ID token
 * verification) when auth is added back; every caller in this codebase goes
 * through requireAuthenticatedUser/getAuthenticatedUser, so that's the only
 * place that needs to change.
 */
export async function getAuthenticatedUser(
  _req: Request,
): Promise<LocalUser | null> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .orderBy(asc(usersTable.id))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(usersTable)
    .values({ name: "Default user", email: null })
    .returning();
  return created ?? null;
}

/**
 * Kept for call-site compatibility with routes that expect a 401 path — it
 * never actually rejects today, since getAuthenticatedUser always resolves
 * to the single default user. Will start rejecting once real auth replaces
 * getAuthenticatedUser above.
 */
export async function requireAuthenticatedUser(
  req: Request,
  res: Response,
): Promise<LocalUser | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}
