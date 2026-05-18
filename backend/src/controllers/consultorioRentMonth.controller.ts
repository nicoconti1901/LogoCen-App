import { Role } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as consultorioRentMonthService from "../services/consultorioRentMonth.service.js";
import { AppError } from "../middleware/errorHandler.js";

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  specialistId: z.string().uuid().optional(),
});

export const listByMonth = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, "Parámetros inválidos: month=YYYY-MM y specialistId opcional (UUID)");
  }
  const { month, specialistId } = parsed.data;
  const role = req.user!.role;

  if (role === Role.SPECIALIST) {
    if (specialistId && specialistId !== req.user!.specialistId) {
      throw new AppError(403, "Sin permisos");
    }
  }

  const result = await consultorioRentMonthService.ensureAndListConsultorioRentMonths({
    yearMonth: month,
    specialistId: role === Role.ADMIN ? specialistId ?? null : null,
    role: role === Role.ADMIN ? "ADMIN" : "SPECIALIST",
    userSpecialistId: req.user!.specialistId ?? null,
  });

  res.json({
    rows: result.rows.map((r) => ({
      id: r.id,
      specialistId: r.specialistId,
      yearMonth: r.yearMonth,
      amount: String(r.amount),
      specialist: r.specialist,
    })),
    total: result.total,
  });
});
