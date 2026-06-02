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

/** Primer día del mes UTC (vigencia de gastos fijos). */
function firstDayOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function listByMonth(month: string, type?: FinanceExpenseType) {
  const { start, end } = getMonthRange(month);

  if (type === "MONTHLY_VARIABLE") {
    return financeExpenseRepository.findVariableByMonth(start, end);
  }

  if (type === "FIXED_MONTHLY") {
    return financeExpenseRepository.findFixedMonthlyActiveAsOf(end);
  }

  const [fixed, variable] = await Promise.all([
    financeExpenseRepository.findFixedMonthlyActiveAsOf(end),
    financeExpenseRepository.findVariableByMonth(start, end),
  ]);

  return [...fixed, ...variable];
}

export function createExpense(data: {
  type: FinanceExpenseType;
  description: string;
  amount: string | number;
  expenseDate: Date;
}) {
  const expenseDate =
    data.type === "FIXED_MONTHLY" ? firstDayOfMonthUtc(data.expenseDate) : data.expenseDate;

  return financeExpenseRepository.create({
    type: data.type,
    description: data.description.trim(),
    amount: data.amount,
    expenseDate,
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
  const nextType = data.type ?? existing.type;
  const nextExpenseDate =
    data.expenseDate !== undefined
      ? nextType === "FIXED_MONTHLY"
        ? firstDayOfMonthUtc(data.expenseDate)
        : data.expenseDate
      : undefined;

  return financeExpenseRepository.update(id, {
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.description !== undefined ? { description: data.description.trim() } : {}),
    ...(data.amount !== undefined ? { amount: data.amount } : {}),
    ...(nextExpenseDate !== undefined ? { expenseDate: nextExpenseDate } : {}),
  });
}

export async function deleteExpense(id: string) {
  const existing = await financeExpenseRepository.findById(id);
  if (!existing) throw new AppError(404, "Gasto no encontrado");
  await financeExpenseRepository.delete(id);
}
