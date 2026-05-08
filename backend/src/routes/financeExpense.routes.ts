import { Role } from "@prisma/client";
import { Router } from "express";
import * as financeExpenseController from "../controllers/financeExpense.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const financeExpenseRouter = Router();

financeExpenseRouter.use(requireAuth, requireRole(Role.ADMIN));

financeExpenseRouter.get("/", financeExpenseController.listByMonth);
financeExpenseRouter.post("/", financeExpenseController.create);
financeExpenseRouter.patch("/:id", financeExpenseController.update);
financeExpenseRouter.delete("/:id", financeExpenseController.remove);
