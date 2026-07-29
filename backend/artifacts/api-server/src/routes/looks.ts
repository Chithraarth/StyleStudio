import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { db, looksTable, avatarsTable, catalogItemsTable } from "@workspace/db";
import { computeSizeProfile } from "../lib/sizing";
import { authorizeLookMutation, authorizeAvatarMutation } from "../middlewares/ownership";
import {
  ListLooksParams,
  ListLooksResponse,
  CreateLookParams,
  CreateLookBody,
  CreateLookResponse,
  GetLookParams,
  GetLookResponse,
  UpdateLookParams,
  UpdateLookBody,
  UpdateLookResponse,
  DeleteLookParams,
  ShareLookParams,
  ShareLookResponse,
  UnshareLookParams,
  GetSharedLookParams,
  GetSharedLookResponse,
} from "@workspace/api-zod";
import { Readable } from "node:stream";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();


const ser = <T extends { createdAt: Date }>(r: T) => ({ ...r, createdAt: r.createdAt.toISOString() });
const router: IRouter = Router();

router.get("/avatars/:avatarId/looks", async (req, res): Promise<void> => {
  const params = ListLooksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await authorizeAvatarMutation(req, res, params.data.avatarId))) {
    return;
  }
  const looks = await db
    .select()
    .from(looksTable)
    .where(eq(looksTable.avatarId, params.data.avatarId))
    .orderBy(desc(looksTable.createdAt));
  res.json(ListLooksResponse.parse(looks.map(ser)));
});

router.post("/avatars/:avatarId/looks", async (req, res): Promise<void> => {
  const params = CreateLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateLookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await authorizeAvatarMutation(req, res, params.data.avatarId))) {
    return;
  }
  const [look] = await db
    .insert(looksTable)
    .values({ ...parsed.data, avatarId: params.data.avatarId })
    .returning();
  res.status(201).json(CreateLookResponse.parse(ser(look)));
});

router.get("/looks/:lookId", async (req, res): Promise<void> => {
  const params = GetLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const look = await authorizeLookMutation(req, res, params.data.lookId);
  if (!look) {
    return;
  }
  res.json(GetLookResponse.parse(ser(look)));
});

router.patch("/looks/:lookId", async (req, res): Promise<void> => {
  const params = UpdateLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateLookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await authorizeLookMutation(req, res, params.data.lookId))) {
    return;
  }
  // If the snapshot is being replaced, capture the previous stored object so
  // it can be cleaned up after a successful update.
  let previousSnapshot: string | null = null;
  if (typeof parsed.data.snapshotDataUrl === "string") {
    const [existing] = await db
      .select({ snapshotDataUrl: looksTable.snapshotDataUrl })
      .from(looksTable)
      .where(eq(looksTable.id, params.data.lookId));
    previousSnapshot = existing?.snapshotDataUrl ?? null;
  }
  const [look] = await db
    .update(looksTable)
    .set(parsed.data)
    .where(eq(looksTable.id, params.data.lookId))
    .returning();
  if (!look) {
    res.status(404).json({ error: "Look not found" });
    return;
  }
  if (
    previousSnapshot &&
    previousSnapshot.startsWith("/objects/") &&
    previousSnapshot !== look.snapshotDataUrl
  ) {
    // Best-effort cleanup of the replaced snapshot; never fails the request.
    void objectStorage.deleteObjectEntity(previousSnapshot).catch(() => {});
  }
  res.json(UpdateLookResponse.parse(ser(look)));
});

router.delete("/looks/:lookId", async (req, res): Promise<void> => {
  const params = DeleteLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await authorizeLookMutation(req, res, params.data.lookId))) {
    return;
  }
  const [look] = await db
    .delete(looksTable)
    .where(eq(looksTable.id, params.data.lookId))
    .returning();
  if (!look) {
    res.status(404).json({ error: "Look not found" });
    return;
  }
  if (look.snapshotDataUrl?.startsWith("/objects/")) {
    // Best-effort cleanup of the stored snapshot; the delete already succeeded.
    void objectStorage.deleteObjectEntity(look.snapshotDataUrl).catch(() => {});
  }
  res.sendStatus(204);
});

router.post("/looks/:lookId/share", async (req, res): Promise<void> => {
  const params = ShareLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const look = await authorizeLookMutation(req, res, params.data.lookId);
  if (!look) {
    return;
  }
  if (look.shareToken) {
    res.json(ShareLookResponse.parse({ shareToken: look.shareToken }));
    return;
  }
  const token = randomBytes(16).toString("base64url");
  const [updated] = await db
    .update(looksTable)
    .set({ shareToken: token })
    .where(eq(looksTable.id, look.id))
    .returning();
  res.json(ShareLookResponse.parse({ shareToken: updated.shareToken }));
});

router.delete("/looks/:lookId/share", async (req, res): Promise<void> => {
  const params = UnshareLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await authorizeLookMutation(req, res, params.data.lookId))) {
    return;
  }
  await db
    .update(looksTable)
    .set({ shareToken: null })
    .where(eq(looksTable.id, params.data.lookId));
  res.sendStatus(204);
});

const SLOTS = ["hairstyle", "beard", "shirt", "pants", "shoes"] as const;

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

router.get("/share/:token/snapshot.jpg", async (req, res): Promise<void> => {
  const params = GetSharedLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [look] = await db
    .select({ snapshotDataUrl: looksTable.snapshotDataUrl })
    .from(looksTable)
    .where(eq(looksTable.shareToken, params.data.token));
  if (!look || !look.snapshotDataUrl) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }
  // New snapshots are stored in object storage as "/objects/..." paths.
  if (look.snapshotDataUrl.startsWith("/objects/")) {
    try {
      const file = await objectStorage.getObjectEntityFile(look.snapshotDataUrl);
      const response = await objectStorage.downloadObject(file, 3600);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Snapshot not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving snapshot from storage");
      res.status(500).json({ error: "Failed to serve snapshot" });
    }
    return;
  }
  // Legacy fallback: snapshots saved as base64 data URLs in the database.
  const match = DATA_URL_RE.exec(look.snapshotDataUrl);
  if (!match) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }
  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(buffer);
});

router.get("/share/:token", async (req, res): Promise<void> => {
  const params = GetSharedLookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [look] = await db
    .select()
    .from(looksTable)
    .where(eq(looksTable.shareToken, params.data.token));
  if (!look) {
    res.status(404).json({ error: "Shared look not found" });
    return;
  }

  const selections = look.selections;
  const itemIds = SLOTS.map(
    (slot) => selections[`${slot}ItemId` as keyof typeof selections] as number | null | undefined,
  ).filter((id): id is number => typeof id === "number");

  const catalogItems = itemIds.length
    ? await db
        .select()
        .from(catalogItemsTable)
        .where(inArray(catalogItemsTable.id, itemIds))
    : [];
  const byId = new Map(catalogItems.map((i) => [i.id, i]));

  const items = SLOTS.flatMap((slot) => {
    const itemId = selections[`${slot}ItemId` as keyof typeof selections] as number | null | undefined;
    if (typeof itemId !== "number") return [];
    const item = byId.get(itemId);
    if (!item) return [];
    const color = selections[`${slot}Color` as keyof typeof selections] as string | null | undefined;
    return [
      {
        slot,
        name: item.name,
        description: item.description ?? null,
        color: color ?? null,
      },
    ];
  });

  const [avatar] = await db
    .select()
    .from(avatarsTable)
    .where(eq(avatarsTable.id, look.avatarId));

  res.json(
    GetSharedLookResponse.parse({
      name: look.name,
      snapshotDataUrl: look.snapshotDataUrl,
      createdAt: look.createdAt.toISOString(),
      items,
      sizeRecommendations: avatar ? computeSizeProfile(avatar) : [],
    }),
  );
});

export default router;
