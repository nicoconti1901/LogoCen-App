import { Router } from "express";
import * as consultorioRentMonthController from "../controllers/consultorioRentMonth.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";

export const consultorioRentMonthRouter = Router();

consultorioRentMonthRouter.use(requireAuth);
consultorioRentMonthRouter.get(
  "/",
  requireRole(Role.ADMIN, Role.SPECIALIST),
  consultorioRentMonthController.listByMonth
);
