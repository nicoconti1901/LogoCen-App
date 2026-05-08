import { Router } from "express";
import { appointmentRouter } from "./appointment.routes.js";
import { authRouter } from "./auth.routes.js";
import { patientRouter } from "./patient.routes.js";
import { paymentRouter } from "./payment.routes.js";
import { specialistRouter } from "./specialist.routes.js";
import { financeConfigRouter } from "./financeConfig.routes.js";
import { financeExpenseRouter } from "./financeExpense.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/specialists", specialistRouter);
apiRouter.use("/patients", patientRouter);
apiRouter.use("/appointments", appointmentRouter);
apiRouter.use("/payments", paymentRouter);
apiRouter.use("/finance-config", financeConfigRouter);
apiRouter.use("/finance-expenses", financeExpenseRouter);
