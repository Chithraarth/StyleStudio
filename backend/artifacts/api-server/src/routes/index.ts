import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import avatarsRouter from "./avatars";
import catalogRouter from "./catalog";
import looksRouter from "./looks";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(avatarsRouter);
router.use(catalogRouter);
router.use(looksRouter);
router.use(storageRouter);

export default router;
