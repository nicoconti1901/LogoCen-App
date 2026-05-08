import { prisma } from "../config/database.js";

const DEFAULT_ID = "default";

export const financeConfigRepository = {
  async getOrCreate() {
    const existing = await prisma.financeConfig.findUnique({ where: { id: DEFAULT_ID } });
    if (existing) return existing;
    return prisma.financeConfig.create({
      data: {
        id: DEFAULT_ID,
        monthlyFixedExpense: 0,
      },
    });
  },

  updateMonthlyFixedExpense(monthlyFixedExpense: string | number) {
    return prisma.financeConfig.upsert({
      where: { id: DEFAULT_ID },
      create: {
        id: DEFAULT_ID,
        monthlyFixedExpense,
      },
      update: {
        monthlyFixedExpense,
      },
    });
  },
};
