import { Router, type IRouter } from "express";
import { desc, eq, inArray, count } from "drizzle-orm";
import { db, usersTable, avatarsTable, looksTable } from "@workspace/db";
import {
  GetUserParams,
  GetUserResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  DeleteUserParams,
  GetUserSummaryParams,
  GetUserSummaryResponse,
} from "@workspace/api-zod";
import { getCallerUserId } from "../middlewares/ownership";
import { requireAuthenticatedUser } from "../middlewares/auth";


const ser = <T extends { createdAt: Date }>(r: T) => ({ ...r, createdAt: r.createdAt.toISOString() });
const router: IRouter = Router();

// NOTE: the legacy unauthenticated `GET /users` and `POST /users` endpoints
// were removed — accounts are provisioned automatically from the verified
// Clerk session on first authenticated request (see middlewares/auth.ts).

// Must be registered before /users/:userId so "me" isn't parsed as an id.
router.get("/users/me", async (req, res): Promise<void> => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  res.json(GetUserResponse.parse(ser(user)));
});

router.get("/users/:userId", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse(ser(user)));
});

router.patch("/users/:userId", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const callerId = await getCallerUserId(req);
  if (callerId === null) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (callerId !== params.data.userId) {
    res.status(403).json({ error: "You can only modify your own profile" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.userId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(UpdateUserResponse.parse(ser(user)));
});

router.delete("/users/:userId", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const callerId = await getCallerUserId(req);
  if (callerId === null) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (callerId !== params.data.userId) {
    res.status(403).json({ error: "You can only delete your own profile" });
    return;
  }
  const [user] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, params.data.userId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/users/:userId/summary", async (req, res): Promise<void> => {
  const params = GetUserSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const avatars = await db
    .select({ id: avatarsTable.id })
    .from(avatarsTable)
    .where(eq(avatarsTable.userId, params.data.userId));
  const avatarIds = avatars.map((a) => a.id);

  let lookCount = 0;
  let latestLookName: string | null = null;
  let latestLookAt: string | null = null;
  if (avatarIds.length > 0) {
    const [{ value }] = await db
      .select({ value: count() })
      .from(looksTable)
      .where(inArray(looksTable.avatarId, avatarIds));
    lookCount = value;
    const [latest] = await db
      .select()
      .from(looksTable)
      .where(inArray(looksTable.avatarId, avatarIds))
      .orderBy(desc(looksTable.createdAt))
      .limit(1);
    if (latest) {
      latestLookName = latest.name;
      latestLookAt = latest.createdAt.toISOString();
    }
  }

  res.json(
    GetUserSummaryResponse.parse({
      avatarCount: avatarIds.length,
      lookCount,
      latestLookName,
      latestLookAt,
    }),
  );
});

export default router;
