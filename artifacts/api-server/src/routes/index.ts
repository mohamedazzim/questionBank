import { Router, type IRouter } from "express";
import healthRouter from "./health";
import subjectsRouter from "./subjects";
import chaptersRouter from "./chapters";
import questionsRouter from "./questions";
import choicesRouter from "./choices";
import dashboardRouter from "./dashboard";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(subjectsRouter);
router.use(chaptersRouter);
router.use(questionsRouter);
router.use(choicesRouter);
router.use(dashboardRouter);
router.use(exportRouter);

export default router;
