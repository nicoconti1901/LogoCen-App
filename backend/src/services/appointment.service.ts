import { AppointmentStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../middleware/errorHandler.js";
import { sendAppointmentConfirmation } from "./mail.service.js";
import { endOfLocalDay, startOfLocalDay } from "../utils/date.js";

async function assertNoOverlap(
  specialistId: string,
  startAt: Date,
  endAt: Date,
  excludeId?: string
): Promise<void> {
  const clash = await prisma.appointment.findFirst({
    where: {
      specialistId,
      status: { not: AppointmentStatus.CANCELLED },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      AND: [{ startAt: { lt: endAt } }, { endAt: { gt: startAt } }],
    },
  });
  if (clash) {
    throw new AppError(409, "El especialista ya tiene una cita en ese horario");
  }
}

const appointmentInclude = {
  patient: true,
  specialist: true,
  office: true,
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

function assertCanAccessAppointment(
  role: Role,
  userSpecialistId: string | null,
  appointmentSpecialistId: string
): void {
  if (role === Role.ADMIN) return;
  if (role === Role.ESPECIALISTA && userSpecialistId === appointmentSpecialistId) return;
  throw new AppError(403, "No puede acceder a esta cita");
}

export async function listAppointments(params: {
  role: Role;
  userSpecialistId: string | null;
  from?: Date;
  to?: Date;
  today?: boolean;
  upcoming?: boolean;
  status?: AppointmentStatus;
  specialistId?: string;
  patientId?: string;
}): Promise<AppointmentWithRelations[]> {
  const where: Prisma.AppointmentWhereInput = {};

  if (params.role === Role.ESPECIALISTA) {
    if (!params.userSpecialistId) throw new AppError(403, "Sin perfil de especialista");
    where.specialistId = params.userSpecialistId;
  } else if (params.specialistId) {
    where.specialistId = params.specialistId;
  }

  if (params.patientId) where.patientId = params.patientId;
  if (params.status) where.status = params.status;

  let startAtFilter: Prisma.DateTimeFilter = {};

  if (params.today) {
    startAtFilter = { gte: startOfLocalDay(), lte: endOfLocalDay() };
  } else {
    if (params.from) startAtFilter.gte = params.from;
    if (params.to) startAtFilter.lte = params.to;
  }

  if (params.upcoming) {
    const now = new Date();
    const prevGte = startAtFilter.gte;
    if (prevGte instanceof Date) {
      startAtFilter.gte = prevGte > now ? prevGte : now;
    } else if (prevGte) {
      const p = new Date(prevGte);
      startAtFilter.gte = p > now ? p : now;
    } else {
      startAtFilter.gte = now;
    }
  }

  if (Object.keys(startAtFilter).length) {
    where.startAt = startAtFilter;
  }

  return prisma.appointment.findMany({
    where,
    include: appointmentInclude,
    orderBy: { startAt: "asc" },
  });
}

export async function getAppointmentById(
  id: string,
  role: Role,
  userSpecialistId: string | null
): Promise<AppointmentWithRelations> {
  const a = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });
  if (!a) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, a.specialistId);
  return a;
}

export async function createAppointment(
  data: {
    patientId: string;
    specialistId: string;
    officeId?: string | null;
    startAt: Date;
    endAt: Date;
    notes?: string | null;
    status?: AppointmentStatus;
  },
  role: Role,
  userSpecialistId: string | null
): Promise<AppointmentWithRelations> {
  if (role === Role.ESPECIALISTA) {
    if (!userSpecialistId || data.specialistId !== userSpecialistId) {
      throw new AppError(403, "Solo puede crear citas para usted mismo");
    }
  }

  if (data.startAt >= data.endAt) {
    throw new AppError(400, "La hora de fin debe ser posterior al inicio");
  }

  const specialist = await prisma.specialist.findUnique({ where: { id: data.specialistId } });
  if (!specialist || !specialist.active) {
    throw new AppError(400, "Especialista inválido o inactivo");
  }

  await prisma.patient.findUniqueOrThrow({ where: { id: data.patientId } });

  if (data.officeId) {
    await prisma.office.findUniqueOrThrow({ where: { id: data.officeId } });
  }

  await assertNoOverlap(data.specialistId, data.startAt, data.endAt);

  const created = await prisma.appointment.create({
    data: {
      patientId: data.patientId,
      specialistId: data.specialistId,
      officeId: data.officeId ?? null,
      startAt: data.startAt,
      endAt: data.endAt,
      notes: data.notes?.trim() || null,
      status: data.status ?? AppointmentStatus.SCHEDULED,
    },
    include: appointmentInclude,
  });

  const specialistName = `${created.specialist.firstName} ${created.specialist.lastName}`;
  await sendAppointmentConfirmation({
    patientName: `${created.patient.firstName} ${created.patient.lastName}`,
    patientEmail: created.patient.email,
    specialistName,
    startAt: created.startAt,
    endAt: created.endAt,
    officeName: created.office?.name ?? null,
    isUpdate: false,
  }).catch((err) => console.error("[mail] confirmación:", err));

  return created;
}

export async function updateAppointment(
  id: string,
  data: Partial<{
    patientId: string;
    specialistId: string;
    officeId: string | null;
    startAt: Date;
    endAt: Date;
    notes: string | null;
    status: AppointmentStatus;
    clinicalHistory: string | null;
  }>,
  role: Role,
  userSpecialistId: string | null
): Promise<AppointmentWithRelations> {
  const existing = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });
  if (!existing) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, existing.specialistId);

  const nextSpecialistId = data.specialistId ?? existing.specialistId;
  const nextStart = data.startAt ?? existing.startAt;
  const nextEnd = data.endAt ?? existing.endAt;

  if (role === Role.ESPECIALISTA) {
    if (data.specialistId && data.specialistId !== userSpecialistId) {
      throw new AppError(403, "No puede reasignar la cita a otro especialista");
    }
    if (data.patientId && data.patientId !== existing.patientId) {
      throw new AppError(403, "No puede cambiar el paciente");
    }
  }

  if (nextStart >= nextEnd) {
    throw new AppError(400, "La hora de fin debe ser posterior al inicio");
  }

  if (data.specialistId || data.startAt || data.endAt) {
    const specialist = await prisma.specialist.findUnique({ where: { id: nextSpecialistId } });
    if (!specialist || !specialist.active) {
      throw new AppError(400, "Especialista inválido o inactivo");
    }
    await assertNoOverlap(nextSpecialistId, nextStart, nextEnd, id);
  }

  if (data.patientId) {
    await prisma.patient.findUniqueOrThrow({ where: { id: data.patientId } });
  }

  if (data.officeId) {
    await prisma.office.findUniqueOrThrow({ where: { id: data.officeId } });
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      ...(data.patientId !== undefined ? { patientId: data.patientId } : {}),
      ...(data.specialistId !== undefined ? { specialistId: data.specialistId } : {}),
      ...(data.officeId !== undefined ? { officeId: data.officeId } : {}),
      ...(data.startAt !== undefined ? { startAt: data.startAt } : {}),
      ...(data.endAt !== undefined ? { endAt: data.endAt } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.clinicalHistory !== undefined
        ? { clinicalHistory: data.clinicalHistory?.trim() || null }
        : {}),
    },
    include: appointmentInclude,
  });

  const timeChanged =
    data.startAt !== undefined ||
    data.endAt !== undefined ||
    data.specialistId !== undefined ||
    data.officeId !== undefined;

  if (timeChanged) {
    const specialistName = `${updated.specialist.firstName} ${updated.specialist.lastName}`;
    await sendAppointmentConfirmation({
      patientName: `${updated.patient.firstName} ${updated.patient.lastName}`,
      patientEmail: updated.patient.email,
      specialistName,
      startAt: updated.startAt,
      endAt: updated.endAt,
      officeName: updated.office?.name ?? null,
      isUpdate: true,
    }).catch((err) => console.error("[mail] reprogramación:", err));
  }

  return updated;
}

export async function deleteAppointment(
  id: string,
  role: Role,
  userSpecialistId: string | null
): Promise<void> {
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, existing.specialistId);
  await prisma.appointment.delete({ where: { id } });
}
