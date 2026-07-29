import { Router, type IRouter } from "express";
import { asc, count, eq } from "drizzle-orm";
import { db, catalogItemsTable } from "@workspace/db";
import {
  ListCatalogItemsQueryParams,
  ListCatalogItemsResponse,
  GetCatalogBreakdownResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/catalog", async (req, res): Promise<void> => {
  const query = ListCatalogItemsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const base = db.select().from(catalogItemsTable);
  const items = query.data.category
    ? await base
        .where(eq(catalogItemsTable.category, query.data.category))
        .orderBy(asc(catalogItemsTable.id))
    : await base.orderBy(asc(catalogItemsTable.id));
  res.json(ListCatalogItemsResponse.parse(items));
});

router.get("/catalog/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ category: catalogItemsTable.category, count: count() })
    .from(catalogItemsTable)
    .groupBy(catalogItemsTable.category);
  res.json(GetCatalogBreakdownResponse.parse(rows));
});

export default router;
