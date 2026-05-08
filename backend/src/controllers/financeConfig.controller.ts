import type { Request, Response } from "express";
import { z } from "zod";
import * as financeConfigService from "../services/financeConfig.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const updateMonthlyFixedExpenseSchema = z.object({
  monthlyFixedExpense: z.union([z.number().min(0), z.string()]),
});

function toResponse(row: { monthlyFixedExpense: { toString(): string } }) {
  return {
    monthlyFixedExpense: row.monthlyFixedExpense.toString(),
  };
}

export const get = asyncHandler(async (_req: Request, res: Response) => {
  const row = await financeConfigService.getFinanceConfig();
  res.json(toResponse(row));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateMonthlyFixedExpenseSchema.parse(req.body);
  const row = await financeConfigService.updateMonthlyFixedExpense(body.monthlyFixedExpense);
  res.json(toResponse(row));
});
