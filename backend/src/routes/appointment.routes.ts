import { Router } from "express";
import * as appointmentController from "../controllers/appointment.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const appointmentRouter = Router();

appointmentRouter.use(requireAuth);

appointmentRouter.get("/", appointmentController.list);
appointmentRouter.get("/:id", appointmentController.getById);
appointmentRouter.post("/", appointmentController.create);
appointmentRouter.patch("/:id", appointmentController.update);
appointmentRouter.delete("/:id", appointmentController.remove);
