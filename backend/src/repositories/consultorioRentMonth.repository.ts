import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

const includeSpecialistName = {
  specialist: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.SpecialistConsultorioRentMonthInclude;

export const consultorioRentMonthRepository = {
  findBySpecialistAndMonth(specialistId: string, yearMonth: string) {
    return prisma.specialistConsultorioRentMonth.findUnique({
      where: { specialistId_yearMonth: { specialistId, yearMonth } },
      include: includeSpecialistName,
    });
  },

  /** Último mes registrado estrictamente anterior a `yearMonth` (orden YYYY-MM). */
  findLatestStrictlyBefore(specialistId: string, yearMonth: string) {
    return prisma.specialistConsultorioRentMonth.findFirst({
      where: { specialistId, yearMonth: { lt: yearMonth } },
      orderBy: { yearMonth: "desc" },
    });
  },

  findManyForMonth(yearMonth: string, specialistIds?: string[]) {
    return prisma.specialistConsultorioRentMonth.findMany({
      where: {
        yearMonth,
        ...(specialistIds?.length ? { specialistId: { in: specialistIds } } : {}),
      },
      include: includeSpecialistName,
      orderBy: [{ specialist: { lastName: "asc" } }, { specialist: { firstName: "asc" } }],
    });
  },

  create(data: { specialistId: string; yearMonth: string; amount: Prisma.Decimal }) {
    return prisma.specialistConsultorioRentMonth.create({
      data: {
        specialistId: data.specialistId,
        yearMonth: data.yearMonth,
        amount: data.amount,
      },
      include: includeSpecialistName,
    });
  },

  /** Alinea filas ya generadas con el valor base del especialista (p. ej. tras editar `monthlyConsultorioRent`). */
  updateAllAmountsForSpecialist(specialistId: string, amount: Prisma.Decimal) {
    return prisma.specialistConsultorioRentMonth.updateMany({
      where: { specialistId },
      data: { amount },
    });
  },
};
