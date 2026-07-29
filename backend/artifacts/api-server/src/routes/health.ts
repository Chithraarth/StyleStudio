import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

// Explicit .ts extension keeps this module loadable under Node's native
// TS stripping (node --test) as well as the tsx dev server.
import { getSnapshotSweepStatus } from "../lib/snapshotSweepStatus.ts";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const snapshotSweep = getSnapshotSweepStatus();
  const data = HealthCheckResponse.parse({
    status: snapshotSweep.alerting || snapshotSweep.stale ? "degraded" : "ok",
    snapshotSweep,
  });
  res.json(data);
});

export default router;
