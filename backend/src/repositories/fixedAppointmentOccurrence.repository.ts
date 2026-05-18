import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

export type FixedOccurrenceRow = Prisma.FixedAppointmentOccurrenceGetPayload<Record<string, never>>;

export const fixedAppointmentOccurrenceRepository = {
  findBySeriesAndDate(seriesId: string, occurrenceDate: Date) {
    return prisma.fixedAppointmentOccurrence.findUnique({
      where: { seriesId_occurrenceDate: { seriesId, occurrenceDate } },
    });
  },

  findManyForSeriesInRange(seriesId: string, from: Date, to: Date) {
    return prisma.fixedAppointmentOccurrence.findMany({
      where: {
        seriesId,
        occurrenceDate: { gte: from, lte: to },
      },
    });
  },

  findManyForSeriesIdsInRange(seriesIds: string[], from: Date, to: Date) {
    if (!seriesIds.length) return Promise.resolve([]);
    return prisma.fixedAppointmentOccurrence.findMany({
      where: {
        seriesId: { in: seriesIds },
        occurrenceDate: { gte: from, lte: to },
      },
    });
  },

  findManyByPatientInRange(patientId: string, from: Date, to: Date) {
    return prisma.fixedAppointmentOccurrence.findMany({
      where: {
        occurrenceDate: { gte: from, lte: to },
        series: { patientId, active: true },
      },
      include: {
        series: { include: { patient: true, specialist: true } },
      },
    });
  },

  upsert(
    seriesId: string,
    occurrenceDate: Date,
    data: Omit<Prisma.FixedAppointmentOccurrenceUncheckedCreateInput, "seriesId" | "occurrenceDate">
  ) {
    return prisma.fixedAppointmentOccurrence.upsert({
      where: { seriesId_occurrenceDate: { seriesId, occurrenceDate } },
      create: { ...data, seriesId, occurrenceDate },
      update: data,
    });
  },
};
