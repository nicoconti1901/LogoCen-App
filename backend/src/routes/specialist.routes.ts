import { Router } from "express";
import { Role } from "@prisma/client";
import * as specialistController from "../controllers/specialist.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadSpecialistPhotoMiddleware } from "../middleware/upload.js";

export const specialistRouter = Router();

specialistRouter.use(requireAuth);

specialistRouter.get("/", specialistController.list);
specialistRouter.get("/me", requireRole(Role.SPECIALIST), specialistController.getMe);
specialistRouter.post(
  "/profile-photo",
  requireRole(Role.ADMIN),
  uploadSpecialistPhotoMiddleware,
  specialistController.uploadProfilePhoto
);
specialistRouter.get("/:id", specialistController.getById);
specialistRouter.post("/", requireRole(Role.ADMIN), specialistController.create);
specialistRouter.patch("/:id", requireRole(Role.ADMIN, Role.SPECIALIST), specialistController.update);
specialistRouter.delete("/:id", requireRole(Role.ADMIN), specialistController.remove);
