import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

const include = {
  patient: true,
  specialist: true,
  payments: true,
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof include }>;

export const appointmentRepository = {
  findById(id: string): Promise<AppointmentWithRelations | null> {
    return prisma.appointment.findUnique({
      where: { id },
      include,
    });
  },

  findMany(where: Prisma.AppointmentWhereInput): Promise<AppointmentWithRelations[]> {
    return prisma.appointment.findMany({
      where,
      include,
      orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
    });
  },

  markExpiredReservedAsAttended(today: Date, nowHHmm: string): Promise<number> {
    return prisma.appointment
      .updateMany({
        where: {
          status: AppointmentStatus.RESERVED,
          OR: [
            { appointmentDate: { lt: today } },
            {
              AND: [{ appointmentDate: { equals: today } }, { endTime: { lte: nowHHmm } }],
            },
          ],
        },
        data: { status: AppointmentStatus.ATTENDED },
      })
      .then((result) => result.count);
  },

  create(data: Prisma.AppointmentCreateInput): Promise<AppointmentWithRelations> {
    return prisma.appointment.create({
      data,
      include,
    });
  },

  update(id: string, data: Prisma.AppointmentUpdateInput): Promise<AppointmentWithRelations> {
    return prisma.appointment.update({
      where: { id },
      data,
      include,
    });
  },

  delete(id: string): Promise<void> {
    return prisma.appointment.delete({ where: { id } }).then(() => undefined);
  },

  /** Citas del mismo día y especialista (para detectar solapamiento de horarios) */
  findBySpecialistAndDate(specialistId: string, appointmentDate: Date, excludeId?: string) {
    return prisma.appointment.findMany({
      where: {
        specialistId,
        appointmentDate,
        /** Ausente con aviso no bloquea la agenda: el hueco puede reasignarse. */
        status: { not: AppointmentStatus.AUSENTE_CON_AVISO },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  /** Citas del mismo día y consultorio (para detectar choques de sala) */
  findByConsultorioAndDate(consultorio: string, appointmentDate: Date, excludeId?: string) {
    return prisma.appointment.findMany({
      where: {
        consultorio,
        appointmentDate,
        status: { not: AppointmentStatus.AUSENTE_CON_AVISO },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },
};
