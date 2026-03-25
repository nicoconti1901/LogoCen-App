import { Router } from "express";
import { Role } from "@prisma/client";
import * as specialistController from "../controllers/specialist.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const specialistRouter = Router();

specialistRouter.use(requireAuth);

specialistRouter.get("/", specialistController.list);
specialistRouter.get("/me", requireRole(Role.SPECIALIST), specialistController.getMe);
specialistRouter.get("/:id", specialistController.getById);
specialistRouter.post("/", requireRole(Role.ADMIN), specialistController.create);
specialistRouter.patch("/:id", requireRole(Role.ADMIN), specialistController.update);
specialistRouter.delete("/:id", requireRole(Role.ADMIN), specialistController.remove);
