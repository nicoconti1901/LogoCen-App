import { Router } from "express";
import { appointmentRouter } from "./appointment.routes.js";
import { authRouter } from "./auth.routes.js";
import { officeRouter } from "./office.routes.js";
import { patientRouter } from "./patient.routes.js";
import { specialistRouter } from "./specialist.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/specialists", specialistRouter);
apiRouter.use("/patients", patientRouter);
apiRouter.use("/offices", officeRouter);
apiRouter.use("/appointments", appointmentRouter);
