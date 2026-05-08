import { FinanceExpenseType } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import * as financeExpenseService from "../services/financeExpense.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const createSchema = z.object({
  type: z.nativeEnum(FinanceExpenseType),
  description: z.string().min(1),
  amount: z.union([z.number().min(0), z.string()]),
  expenseDate: z.coerce.date(),
});

const updateSchema = z.object({
  type: z.nativeEnum(FinanceExpenseType).optional(),
  description: z.string().min(1).optional(),
  amount: z.union([z.number().min(0), z.string()]).optional(),
  expenseDate: z.coerce.date().optional(),
});

function toResponse(row: {
  id: string;
  type: FinanceExpenseType;
  description: string;
  amount: { toString(): string };
  expenseDate: Date;
}) {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    amount: row.amount.toString(),
    expenseDate: row.expenseDate.toISOString(),
  };
}

export const listByMonth = asyncHandler(async (req: Request, res: Response) => {
  const month = monthSchema.parse(req.query.month);
  const type =
    typeof req.query.type === "string" && req.query.type in FinanceExpenseType
      ? (req.query.type as FinanceExpenseType)
      : undefined;
  const rows = await financeExpenseService.listByMonth(month, type);
  res.json(rows.map(toResponse));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await financeExpenseService.createExpense(body);
  res.status(201).json(toResponse(row));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const row = await financeExpenseService.updateExpense(String(req.params.id), body);
  res.json(toResponse(row));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await financeExpenseService.deleteExpense(String(req.params.id));
  res.status(204).send();
});
