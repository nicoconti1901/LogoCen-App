import { Router } from "express";
import * as paymentController from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const paymentRouter = Router();

paymentRouter.use(requireAuth);

paymentRouter.get("/", paymentController.list);
paymentRouter.get("/:id", paymentController.getById);
paymentRouter.post("/", paymentController.create);
paymentRouter.patch("/:id", paymentController.update);
paymentRouter.delete("/:id", paymentController.remove);
