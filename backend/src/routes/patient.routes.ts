import { Router } from "express";
import { Role } from "@prisma/client";
import * as patientController from "../controllers/patient.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const patientRouter = Router();

patientRouter.use(requireAuth);

patientRouter.get("/", patientController.list);
patientRouter.get("/:id", patientController.getById);
patientRouter.post("/", requireRole(Role.ADMIN), patientController.create);
patientRouter.patch("/:id", requireRole(Role.ADMIN), patientController.update);
patientRouter.delete("/:id", requireRole(Role.ADMIN), patientController.remove);
