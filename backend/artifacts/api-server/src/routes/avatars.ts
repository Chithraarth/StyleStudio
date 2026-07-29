import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, avatarsTable, usersTable } from "@workspace/db";
import { requireAuthenticatedUser } from "../middlewares/auth";
import {
  ListAvatarsParams,
  ListAvatarsResponse,
  CreateAvatarParams,
  CreateAvatarBody,
  CreateAvatarResponse,
  GetAvatarParams,
  GetAvatarResponse,
  UpdateAvatarParams,
  UpdateAvatarBody,
  UpdateAvatarResponse,
  DeleteAvatarParams,
  GetSizeProfileParams,
  GetSizeProfileResponse,
} from "@workspace/api-zod";
import { computeSizeProfile } from "../lib/sizing";
import { authorizeAvatarMutation } from "../middlewares/ownership";


const ser = <T extends { createdAt: Date }>(r: T) => ({ ...r, createdAt: r.createdAt.toISOString() });
const router: IRouter = Router();

router.get("/users/:userId/avatars", async (req, res): Promise<void> => {
  const params = ListAvatarsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const avatars = await db
    .select()
    .from(avatarsTable)
    .where(eq(avatarsTable.userId, params.data.userId))
    .orderBy(desc(avatarsTable.createdAt));
  res.json(ListAvatarsResponse.parse(avatars.map(ser)));
});

router.post("/users/:userId/avatars", async (req, res): Promise<void> => {
  const params = CreateAvatarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateAvatarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const caller = await requireAuthenticatedUser(req, res);
  if (!caller) return;
  if (caller.id !== params.data.userId) {
    res.status(403).json({ error: "You can only create avatars on your own account" });
    return;
  }
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, params.data.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [avatar] = await db
    .insert(avatarsTable)
    .values({ ...parsed.data, userId: params.data.userId })
    .returning();
  res.status(201).json(CreateAvatarResponse.parse(ser(avatar)));
});

router.get("/avatars/:avatarId", async (req, res): Promise<void> => {
  const params = GetAvatarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [avatar] = await db
    .select()
    .from(avatarsTable)
    .where(eq(avatarsTable.id, params.data.avatarId));
  if (!avatar) {
    res.status(404).json({ error: "Avatar not found" });
    return;
  }
  res.json(GetAvatarResponse.parse(ser(avatar)));
});

router.patch("/avatars/:avatarId", async (req, res): Promise<void> => {
  const params = UpdateAvatarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAvatarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await authorizeAvatarMutation(req, res, params.data.avatarId))) {
    return;
  }
  const [avatar] = await db
    .update(avatarsTable)
    .set(parsed.data)
    .where(eq(avatarsTable.id, params.data.avatarId))
    .returning();
  if (!avatar) {
    res.status(404).json({ error: "Avatar not found" });
    return;
  }
  res.json(UpdateAvatarResponse.parse(ser(avatar)));
});

router.delete("/avatars/:avatarId", async (req, res): Promise<void> => {
  const params = DeleteAvatarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await authorizeAvatarMutation(req, res, params.data.avatarId))) {
    return;
  }
  const [avatar] = await db
    .delete(avatarsTable)
    .where(eq(avatarsTable.id, params.data.avatarId))
    .returning();
  if (!avatar) {
    res.status(404).json({ error: "Avatar not found" });
    return;
  }
  res.sendStatus(204);
});

router.get(
  "/avatars/:avatarId/size-profile",
  async (req, res): Promise<void> => {
    const params = GetSizeProfileParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [avatar] = await db
      .select()
      .from(avatarsTable)
      .where(eq(avatarsTable.id, params.data.avatarId));
    if (!avatar) {
      res.status(404).json({ error: "Avatar not found" });
      return;
    }
    res.json(GetSizeProfileResponse.parse(computeSizeProfile(avatar)));
  },
);

export default router;
