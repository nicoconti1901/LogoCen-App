import { Router } from "express";
import { Role } from "@prisma/client";
import * as patientController from "../controllers/patient.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const patientRouter = Router();

patientRouter.use(requireAuth);

patientRouter.get("/", patientController.list);
patientRouter.get("/:id", patientController.getById);
patientRouter.get("/:id/clinical-history", patientController.listClinicalHistory);
patientRouter.post("/:id/clinical-history", patientController.createClinicalHistory);
patientRouter.patch("/:id/clinical-history/:entryId", patientController.updateClinicalHistory);
patientRouter.delete("/:id/clinical-history/:entryId", patientController.removeClinicalHistory);
patientRouter.post("/", requireRole(Role.ADMIN, Role.SPECIALIST), patientController.create);
patientRouter.patch("/:id", requireRole(Role.ADMIN), patientController.update);
patientRouter.delete("/:id", requireRole(Role.ADMIN), patientController.remove);
