import type { Prisma, Weekday } from "@prisma/client";
import { prisma } from "../config/database.js";

const include = {
  patient: true,
  specialist: true,
  skips: true,
} satisfies Prisma.FixedAppointmentSeriesInclude;

export type FixedSeriesWithRelations = Prisma.FixedAppointmentSeriesGetPayload<{ include: typeof include }>;

export type FixedSeriesWithOccurrencesInRange = FixedSeriesWithRelations & {
  occurrences: import("./fixedAppointmentOccurrence.repository.js").FixedOccurrenceRow[];
};

export const fixedAppointmentSeriesRepository = {
  findById(id: string): Promise<FixedSeriesWithRelations | null> {
    return prisma.fixedAppointmentSeries.findUnique({ where: { id }, include });
  },

  findActiveOverlappingRange(params: {
    specialistId?: string;
    patientId?: string;
    from?: Date;
    to?: Date;
  }): Promise<FixedSeriesWithRelations[]> {
    const and: Prisma.FixedAppointmentSeriesWhereInput[] = [{ active: true }];
    if (params.specialistId) and.push({ specialistId: params.specialistId });
    if (params.patientId) and.push({ patientId: params.patientId });
    if (params.from || params.to) {
      and.push({
        OR: [
          { effectiveUntil: null },
          ...(params.from ? [{ effectiveUntil: { gte: params.from } }] : []),
        ],
      });
      if (params.to) {
        and.push({ effectiveFrom: { lte: params.to } });
      }
    }
    return prisma.fixedAppointmentSeries.findMany({
      where: { AND: and },
      include,
    });
  },

  findActiveForAgenda(params: {
    specialistId?: string;
    patientId?: string;
    rangeFrom: Date;
    rangeTo: Date;
  }): Promise<FixedSeriesWithOccurrencesInRange[]> {
    return prisma.fixedAppointmentSeries.findMany({
      where: {
        active: true,
        effectiveFrom: { lte: params.rangeTo },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: params.rangeFrom } }],
        ...(params.specialistId ? { specialistId: params.specialistId } : {}),
        ...(params.patientId ? { patientId: params.patientId } : {}),
      },
      include: {
        patient: true,
        specialist: true,
        skips: true,
        occurrences: {
          where: {
            occurrenceDate: { gte: params.rangeFrom, lte: params.rangeTo },
          },
        },
      },
    });
  },

  findActiveByPatientSpecialistWeekday(params: {
    patientId: string;
    specialistId: string;
    weekday: Weekday;
    startTime: string;
  }): Promise<FixedSeriesWithRelations | null> {
    return prisma.fixedAppointmentSeries.findFirst({
      where: {
        active: true,
        patientId: params.patientId,
        specialistId: params.specialistId,
        weekday: params.weekday,
        startTime: params.startTime,
      },
      include,
    });
  },

  create(data: {
    patientId: string;
    specialistId: string;
    consultorio: string;
    weekday: Weekday;
    startTime: string;
    displayDurationMinutes: number;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    reasonForVisit?: string | null;
  }): Promise<FixedSeriesWithRelations> {
    return prisma.fixedAppointmentSeries.create({
      data: {
        patientId: data.patientId,
        specialistId: data.specialistId,
        consultorio: data.consultorio,
        weekday: data.weekday,
        startTime: data.startTime,
        displayDurationMinutes: data.displayDurationMinutes,
        effectiveFrom: data.effectiveFrom,
        effectiveUntil: data.effectiveUntil,
        reasonForVisit: data.reasonForVisit?.trim() || null,
      },
      include,
    });
  },

  deactivate(id: string, effectiveUntil: Date): Promise<FixedSeriesWithRelations> {
    return prisma.fixedAppointmentSeries.update({
      where: { id },
      data: { active: false, effectiveUntil },
      include,
    });
  },

  addSkip(seriesId: string, skipDate: Date): Promise<void> {
    return prisma.fixedAppointmentSkip
      .create({ data: { seriesId, skipDate } })
      .then(() => undefined);
  },
};
