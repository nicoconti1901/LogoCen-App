import { Prisma, type FinanceExpenseType } from "@prisma/client";
import { prisma } from "../config/database.js";

export const financeExpenseRepository = {
  /** Gastos variables: solo en el mes calendario del comprobante. */
  findVariableByMonth(monthStart: Date, monthEnd: Date) {
    return prisma.financeExpense.findMany({
      where: {
        type: "MONTHLY_VARIABLE",
        expenseDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
    });
  },

  /** Gastos fijos: vigentes en el mes M si se cargaron en M o antes (se repiten cada mes). */
  findFixedMonthlyActiveAsOf(monthEnd: Date) {
    return prisma.financeExpense.findMany({
      where: {
        type: "FIXED_MONTHLY",
        expenseDate: { lte: monthEnd },
      },
      orderBy: [{ expenseDate: "asc" }, { description: "asc" }],
    });
  },

  findManyByMonth(monthStart: Date, monthEnd: Date, type?: FinanceExpenseType) {
    return prisma.financeExpense.findMany({
      where: {
        expenseDate: {
          gte: monthStart,
          lte: monthEnd,
        },
        ...(type ? { type } : {}),
      },
      orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.financeExpense.findUnique({ where: { id } });
  },

  create(data: Prisma.FinanceExpenseCreateInput) {
    return prisma.financeExpense.create({ data });
  },

  update(id: string, data: Prisma.FinanceExpenseUpdateInput) {
    return prisma.financeExpense.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.financeExpense.delete({ where: { id } }).then(() => undefined);
  },
};
