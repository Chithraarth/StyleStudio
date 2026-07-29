import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, looksTable, avatarsTable } from "@workspace/db";
import { getAuthenticatedUser } from "./auth";

/**
 * Reads the caller's local user id. No real auth is wired up right now, so
 * this always resolves to the single auto-provisioned default user (see
 * middlewares/auth.ts) — never actually returns null today.
 */
export async function getCallerUserId(req: Request): Promise<number | null> {
  const user = await getAuthenticatedUser(req);
  return user?.id ?? null;
}

type Look = typeof looksTable.$inferSelect;

/**
 * Loads the look and verifies the caller owns it (via its avatar's userId).
 * On failure, sends the appropriate error response and returns null.
 * On success, returns the look row.
 */
export async function authorizeLookMutation(
  req: Request,
  res: Response,
  lookId: number,
): Promise<Look | null> {
  const [row] = await db
    .select({ look: looksTable, ownerId: avatarsTable.userId })
    .from(looksTable)
    .innerJoin(avatarsTable, eq(avatarsTable.id, looksTable.avatarId))
    .where(eq(looksTable.id, lookId));
  if (!row) {
    res.status(404).json({ error: "Look not found" });
    return null;
  }
  const callerId = await getCallerUserId(req);
  if (callerId === null) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (callerId !== row.ownerId) {
    res.status(403).json({ error: "You do not own this look" });
    return null;
  }
  return row.look;
}

/**
 * Verifies the caller owns the given avatar. Sends an error response and
 * returns false when the avatar is missing or owned by someone else.
 */
export async function authorizeAvatarMutation(
  req: Request,
  res: Response,
  avatarId: number,
): Promise<boolean> {
  const [avatar] = await db
    .select({ id: avatarsTable.id, ownerId: avatarsTable.userId })
    .from(avatarsTable)
    .where(eq(avatarsTable.id, avatarId));
  if (!avatar) {
    res.status(404).json({ error: "Avatar not found" });
    return false;
  }
  const callerId = await getCallerUserId(req);
  if (callerId === null) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (callerId !== avatar.ownerId) {
    res.status(403).json({ error: "You do not own this avatar" });
    return false;
  }
  return true;
}
