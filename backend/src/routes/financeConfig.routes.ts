import { Router } from "express";
import * as financeConfigController from "../controllers/financeConfig.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";

export const financeConfigRouter = Router();

financeConfigRouter.use(requireAuth, requireRole(Role.ADMIN));

financeConfigRouter.get("/", financeConfigController.get);
financeConfigRouter.patch("/", financeConfigController.update);
