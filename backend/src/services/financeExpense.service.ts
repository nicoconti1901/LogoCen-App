import { type FinanceExpenseType } from "@prisma/client";
import { AppError } from "../middleware/errorHandler.js";
import { financeExpenseRepository } from "../repositories/financeExpense.repository.js";

function getMonthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new AppError(400, "Mes inválido. Formato esperado: YYYY-MM");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new AppError(400, "Mes inválido. Formato esperado: YYYY-MM");
  }
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { start, end };
}

export function listByMonth(month: string, type?: FinanceExpenseType) {
  const { start, end } = getMonthRange(month);
  return financeExpenseRepository.findManyByMonth(start, end, type);
}

export function createExpense(data: {
  type: FinanceExpenseType;
  description: string;
  amount: string | number;
  expenseDate: Date;
}) {
  return financeExpenseRepository.create({
    type: data.type,
    description: data.description.trim(),
    amount: data.amount,
    expenseDate: data.expenseDate,
  });
}

export async function updateExpense(
  id: string,
  data: Partial<{
    type: FinanceExpenseType;
    description: string;
    amount: string | number;
    expenseDate: Date;
  }>
) {
  const existing = await financeExpenseRepository.findById(id);
  if (!existing) throw new AppError(404, "Gasto no encontrado");
  return financeExpenseRepository.update(id, {
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.description !== undefined ? { description: data.description.trim() } : {}),
    ...(data.amount !== undefined ? { amount: data.amount } : {}),
    ...(data.expenseDate !== undefined ? { expenseDate: data.expenseDate } : {}),
  });
}

export async function deleteExpense(id: string) {
  const existing = await financeExpenseRepository.findById(id);
  if (!existing) throw new AppError(404, "Gasto no encontrado");
  await financeExpenseRepository.delete(id);
}
