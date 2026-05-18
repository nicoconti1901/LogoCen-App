import { Router } from "express";
import * as appointmentController from "../controllers/appointment.controller.js";
import * as fixedAppointmentSeriesController from "../controllers/fixedAppointmentSeries.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const appointmentRouter = Router();

appointmentRouter.use(requireAuth);

appointmentRouter.get("/", appointmentController.list);
appointmentRouter.get("/fixed-series/by-patient", fixedAppointmentSeriesController.listByPatient);
appointmentRouter.post("/fixed-series", fixedAppointmentSeriesController.create);
appointmentRouter.post("/fixed-series/:seriesId/skip", fixedAppointmentSeriesController.skipOccurrence);
appointmentRouter.patch("/fixed-series/:seriesId/occurrences", fixedAppointmentSeriesController.upsertOccurrence);
appointmentRouter.patch("/fixed-series/:seriesId/cancel", fixedAppointmentSeriesController.cancel);
appointmentRouter.get("/:id", appointmentController.getById);
appointmentRouter.post("/", appointmentController.create);
appointmentRouter.patch("/:id", appointmentController.update);
appointmentRouter.delete("/:id", appointmentController.remove);
