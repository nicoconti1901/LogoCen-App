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
        status: { notIn: [AppointmentStatus.CANCELLED] },
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
        status: { notIn: [AppointmentStatus.CANCELLED] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },
};
