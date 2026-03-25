import { Router } from "express";
import { Role } from "@prisma/client";
import * as officeController from "../controllers/office.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const officeRouter = Router();

officeRouter.use(requireAuth);

officeRouter.get("/", officeController.list);
officeRouter.get("/:id", officeController.getById);
officeRouter.post("/", requireRole(Role.ADMIN), officeController.create);
officeRouter.patch("/:id", requireRole(Role.ADMIN), officeController.update);
officeRouter.delete("/:id", requireRole(Role.ADMIN), officeController.remove);
