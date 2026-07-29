import type { Request, Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

type LocalUser = typeof usersTable.$inferSelect;

/**
 * Resolves the caller's local user row from the verified Clerk session.
 * On the first authenticated request, a local user row is provisioned
 * just-in-time from the Clerk profile.
 *
 * Returns null when the request carries no valid Clerk session.
 */
export async function getAuthenticatedUser(
  req: Request,
): Promise<LocalUser | null> {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) return null;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (existing) return existing;

  // First request from this Clerk account: provision a local profile.
  let name = "New user";
  let email: string | null = null;
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const fullName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
    name = fullName || clerkUser.username || email?.split("@")[0] || name;
  } catch (err) {
    req.log?.warn({ err }, "Failed to fetch Clerk profile for provisioning");
  }

  // Handle a concurrent first request racing the insert.
  const [created] = await db
    .insert(usersTable)
    .values({ clerkId, name, email })
    .onConflictDoNothing({ target: usersTable.clerkId })
    .returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  return raced ?? null;
}

/**
 * Like getAuthenticatedUser, but sends a 401 response and returns null
 * when the caller is not signed in.
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
