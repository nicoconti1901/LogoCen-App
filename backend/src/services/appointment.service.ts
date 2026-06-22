import {
  AppointmentPaymentMethod,
  AppointmentStatus,
  PatientConfirmationSource,
  Prisma,
  Role,
} from "@prisma/client";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { patientRepository } from "../repositories/patient.repository.js";
import { specialistRepository } from "../repositories/specialist.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  assertValidTime,
  currentTimeHHmm,
  parseDateOnlyISO,
  timeToMinutes,
  timesOverlap,
  toDateOnly,
  weekdayFromDate,
} from "../utils/appointmentTime.js";
import { endOfLocalDay, startOfLocalDay } from "../utils/date.js";
import { parseMoneyToDecimal, reservationDepositForStatus } from "./appointmentPayment.utils.js";
import {
  matchesConfirmationListFilter,
  syncPatientConfirmationForStatusChange,
  type ConfirmationListFilter,
} from "../utils/appointmentConfirmation.js";
import {
  cancelWhatsappRemindersForAppointment,
  syncWhatsappReminderForAppointment,
} from "./whatsappReminder.service.js";
import {
  normalizeAppointmentPaymentFields,
  parseStoredPaymentSplits,
  type PaymentSplitInput,
} from "../utils/appointmentPaymentSplits.js";

function assertCanAccessAppointment(
  role: Role,
  userSpecialistId: string | null,
  appointmentSpecialistId: string
): void {
  if (role === Role.ADMIN) return;
  if (role === Role.SPECIALIST && userSpecialistId === appointmentSpecialistId) return;
  throw new AppError(403, "No puede acceder a esta cita");
}

function assertEndAfterStart(startTime: string, endTime: string): void {
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new AppError(400, "La hora de fin debe ser posterior al inicio");
  }
}

export function assertInsideAvailability(
  specialist: Awaited<ReturnType<typeof specialistRepository.findById>>,
  appointmentDate: Date,
  startTime: string,
  endTime: string
): void {
  const availabilities = specialist?.availabilities ?? [];
  if (availabilities.length === 0) {
    throw new AppError(400, "El especialista no tiene disponibilidad configurada");
  }
  const weekday = weekdayFromDate(appointmentDate);
  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  const allowed = availabilities.some((a) => {
    if (a.weekday !== weekday) return false;
    const rangeStart = timeToMinutes(a.startTime);
    const rangeEnd = timeToMinutes(a.endTime);
    return startM >= rangeStart && endM <= rangeEnd;
  });
  if (!allowed) {
    throw new AppError(400, "El especialista no atiende en ese día y horario");
  }
}

export type ScheduleConflictExclude = {
  excludeSeriesId?: string;
  excludePatientSpecialist?: { patientId: string; specialistId: string };
};

export async function assertNoOverlap(
  specialistId: string,
  appointmentDate: Date,
  startTime: string,
  endTime: string,
  excludeId?: string,
  conflictExclude?: ScheduleConflictExclude
): Promise<void> {
  const sameDay = await appointmentRepository.findBySpecialistAndDate(
    specialistId,
    appointmentDate,
    excludeId
  );
  for (const row of sameDay) {
    if (timesOverlap(startTime, endTime, row.startTime, row.endTime)) {
      throw new AppError(409, "El especialista ya tiene una cita en ese horario");
    }
  }

  const { assertNoFixedSeriesBlocksSpecialist } = await import("../utils/fixedAppointmentScheduling.js");
  await assertNoFixedSeriesBlocksSpecialist({
    specialistId,
    appointmentDate,
    startTime,
    endTime,
    excludeSeriesId: conflictExclude?.excludeSeriesId,
    excludePatientSpecialist: conflictExclude?.excludePatientSpecialist,
  });
}

export async function assertNoConsultorioOverlap(
  consultorio: string,
  appointmentDate: Date,
  startTime: string,
  endTime: string,
  excludeId?: string,
  conflictExclude?: ScheduleConflictExclude
): Promise<void> {
  if (!consultorio.trim()) return;
  const sameDay = await appointmentRepository.findByConsultorioAndDate(
    consultorio,
    appointmentDate,
    excludeId
  );
  for (const row of sameDay) {
    if (timesOverlap(startTime, endTime, row.startTime, row.endTime)) {
      throw new AppError(409, "El consultorio ya está ocupado en ese horario");
    }
  }

  const { assertNoFixedSeriesBlocksConsultorio } = await import("../utils/fixedAppointmentScheduling.js");
  await assertNoFixedSeriesBlocksConsultorio({
    consultorio,
    appointmentDate,
    startTime,
    endTime,
    excludeSeriesId: conflictExclude?.excludeSeriesId,
    excludePatientSpecialist: conflictExclude?.excludePatientSpecialist,
  });
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
  confirmation?: ConfirmationListFilter;
}) {
  const todayOnly = toDateOnly(new Date());
  const nowT = currentTimeHHmm();
  await appointmentRepository.markExpiredReservedAsAttended(todayOnly, nowT);

  const where: Prisma.AppointmentWhereInput = {};

  if (params.role === Role.SPECIALIST) {
    if (!params.userSpecialistId) {
      return [];
    }
    where.specialistId = params.userSpecialistId;
  } else if (params.specialistId) {
    where.specialistId = params.specialistId;
  }

  if (params.patientId) where.patientId = params.patientId;
  if (params.status) where.status = params.status;

  if (params.today && params.upcoming) {
    where.appointmentDate = { equals: todayOnly };
    where.startTime = { gte: nowT };
  } else if (params.today) {
    const s = startOfLocalDay();
    const e = endOfLocalDay();
    where.appointmentDate = { gte: toDateOnly(s), lte: toDateOnly(e) };
  } else {
    const range: Prisma.DateTimeFilter = {};
    if (params.from) range.gte = toDateOnly(params.from);
    if (params.to) range.lte = toDateOnly(params.to);
    if (Object.keys(range).length) where.appointmentDate = range;
  }

  if (params.upcoming && !params.today) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { appointmentDate: { gt: todayOnly } },
          {
            AND: [{ appointmentDate: { equals: todayOnly } }, { startTime: { gte: nowT } }],
          },
        ],
      },
    ];
  }

  const rows = await appointmentRepository.findMany(where);

  const shouldExpandFixed = Boolean(params.from || params.to || params.patientId);
  if (shouldExpandFixed) {
    const specialistIdForFixed =
      params.role === Role.SPECIALIST
        ? params.userSpecialistId ?? undefined
        : params.specialistId;
    const forPaymentSummary = Boolean(params.patientId && !params.from && !params.to);
    const { expandFixedAppointmentsForRange } = await import("./fixedAppointmentSeries.service.js");
    const virtual = await expandFixedAppointmentsForRange({
      rangeFrom: params.from,
      rangeTo: params.to,
      specialistId: specialistIdForFixed,
      patientId: params.patientId,
      realAppointments: rows,
      forPaymentSummary,
    });
    let merged = [...rows, ...virtual];
    if (params.patientId) {
      merged = merged.filter((a) => a.patientId === params.patientId);
    }
    if (params.status) {
      merged = merged.filter((a) => a.status === params.status);
    }
    if (params.confirmation) {
      merged = merged.filter((a) => matchesConfirmationListFilter(a, params.confirmation!));
    }
    merged.sort((a, b) => {
      const d = a.appointmentDate.getTime() - b.appointmentDate.getTime();
      if (d !== 0) return d;
      return a.startTime.localeCompare(b.startTime);
    });
    return merged;
  }

  if (params.confirmation) {
    return rows.filter((a) => matchesConfirmationListFilter(a, params.confirmation!));
  }
  return rows;
}

/** Franjas ocupadas por consultorio (todos los especialistas + turnos fijos) para validar sala en el modal. */
export async function listConsultorioSlotsForRange(from: Date, to: Date) {
  const rangeFrom = toDateOnly(from);
  const rangeTo = toDateOnly(to);
  const rows = await appointmentRepository.findMany({
    appointmentDate: { gte: rangeFrom, lte: rangeTo },
    status: { not: AppointmentStatus.AUSENTE_CON_AVISO },
  });

  const { expandFixedAppointmentsForRange } = await import("./fixedAppointmentSeries.service.js");
  const virtual = await expandFixedAppointmentsForRange({
    rangeFrom,
    rangeTo,
    realAppointments: rows,
  });

  const merged = [...rows, ...virtual].filter((a) => a.status !== AppointmentStatus.AUSENTE_CON_AVISO);

  const { parseFixedAppointmentId } = await import("../utils/fixedAppointmentOccurrences.js");
  return merged.map((a) => {
    const parsed = parseFixedAppointmentId(a.id);
    return {
      id: a.id,
      consultorio: a.consultorio.trim(),
      appointmentDate: a.appointmentDate,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status,
      isFixedSeries: Boolean(parsed),
      fixedSeriesId: parsed?.seriesId ?? null,
      patientId: a.patientId,
      specialistId: a.specialistId,
    };
  });
}

export async function getAppointmentById(id: string, role: Role, userSpecialistId: string | null) {
  const { parseFixedAppointmentId } = await import("../utils/fixedAppointmentOccurrences.js");
  if (parseFixedAppointmentId(id)) {
    const { getFixedVirtualAppointmentById } = await import("./fixedAppointmentSeries.service.js");
    return getFixedVirtualAppointmentById(id, role, userSpecialistId);
  }

  const todayOnly = toDateOnly(new Date());
  const nowT = currentTimeHHmm();
  await appointmentRepository.markExpiredReservedAsAttended(todayOnly, nowT);
  const a = await appointmentRepository.findById(id);
  if (!a) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, a.specialistId);
  return a;
}

function resolvePaymentFields(
  data: {
    paymentMethod?: AppointmentPaymentMethod | null;
    paymentSplits?: PaymentSplitInput[] | null;
  },
  existing?: {
    paymentMethod: AppointmentPaymentMethod | null;
    paymentSplits: unknown;
  }
) {
  if (data.paymentSplits === undefined && data.paymentMethod === undefined) return null;
  const existingSplits = existing ? parseStoredPaymentSplits(existing.paymentSplits) : null;
  return normalizeAppointmentPaymentFields({
    paymentMethod:
      data.paymentMethod !== undefined ? data.paymentMethod : (existing?.paymentMethod ?? null),
    paymentSplits:
      data.paymentSplits !== undefined ? data.paymentSplits : existingSplits,
  });
}

export async function createAppointment(
  data: {
    patientId: string;
    specialistId: string;
    consultorio: string;
    appointmentDate: Date;
    startTime: string;
    endTime: string;
    status?: AppointmentStatus;
    paymentMethod?: AppointmentPaymentMethod | null;
    paymentSplits?: PaymentSplitInput[] | null;
    paymentCompleted?: boolean;
    paymentDate?: Date | null;
    medicalRecord?: string | null;
    reasonForVisit?: string | null;
    reservationDepositAmount?: string | number | null;
  },
  role: Role,
  userSpecialistId: string | null
) {
  if (role === Role.SPECIALIST) {
    if (!userSpecialistId || data.specialistId !== userSpecialistId) {
      throw new AppError(403, "Solo puede crear citas para usted mismo");
    }
  }

  const startTime = assertValidTime(data.startTime);
  const endTime = assertValidTime(data.endTime);
  assertEndAfterStart(startTime, endTime);
  const status = data.status ?? AppointmentStatus.RESERVED;
  const isAusenteConAviso = status === AppointmentStatus.AUSENTE_CON_AVISO;
  const consultorio = isAusenteConAviso ? "" : data.consultorio.trim();
  if (!isAusenteConAviso && !consultorio) throw new AppError(400, "Debe indicar el consultorio");

  const appointmentDate = toDateOnly(data.appointmentDate);

  const specialist = await specialistRepository.findById(data.specialistId);
  if (!specialist || !specialist.active) {
    throw new AppError(400, "Especialista inválido o inactivo");
  }
  assertInsideAvailability(specialist, appointmentDate, startTime, endTime);

  const patient = await patientRepository.findById(data.patientId);
  if (!patient) throw new AppError(400, "Paciente no encontrado");

  await assertNoOverlap(data.specialistId, appointmentDate, startTime, endTime);
  if (consultorio) {
    await assertNoConsultorioOverlap(consultorio, appointmentDate, startTime, endTime);
  }

  const parsedDeposit = parseMoneyToDecimal(data.reservationDepositAmount ?? null);
  const reservationDepositAmount = reservationDepositForStatus(
    status,
    parsedDeposit,
    null,
    specialist.consultationFee
  );

  const paymentFields = resolvePaymentFields(data);

  const created = await appointmentRepository.create({
    patient: { connect: { id: data.patientId } },
    specialist: { connect: { id: data.specialistId } },
    consultorio,
    appointmentDate,
    startTime,
    endTime,
    status,
    reservationDepositAmount,
    paymentMethod: paymentFields?.paymentMethod ?? data.paymentMethod ?? null,
    ...(paymentFields ? { paymentSplits: paymentFields.paymentSplits } : {}),
    paymentCompleted: data.paymentCompleted ?? false,
    paymentDate: data.paymentCompleted ? (data.paymentDate ?? null) : null,
    medicalRecord: data.medicalRecord?.trim() || null,
    reasonForVisit: data.reasonForVisit?.trim() || null,
  });

  void syncWhatsappReminderForAppointment({
    appointmentRef: created.id,
    patientId: created.patientId,
    specialistId: created.specialistId,
    appointmentDate: created.appointmentDate,
    startTime: created.startTime,
    endTime: created.endTime,
    consultorio: created.consultorio,
    status: created.status,
  }).catch(() => undefined);

  return created;
}

export async function updateAppointment(
  id: string,
  data: Partial<{
    patientId: string;
    specialistId: string;
    consultorio: string;
    appointmentDate: Date;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    patientConfirmationSource?: PatientConfirmationSource | null;
    paymentMethod: AppointmentPaymentMethod | null;
    paymentSplits?: PaymentSplitInput[] | null;
    paymentCompleted: boolean;
    paymentDate: Date | null;
    specialistSettledAt: Date | null;
    medicalRecord: string | null;
    reasonForVisit: string | null;
    reservationDepositAmount: string | number | null;
  }>,
  role: Role,
  userSpecialistId: string | null
) {
  const { parseFixedAppointmentId } = await import("../utils/fixedAppointmentOccurrences.js");
  const fixedParsed = parseFixedAppointmentId(id);
  if (fixedParsed) {
    const { upsertFixedAppointmentOccurrence } = await import("./fixedAppointmentSeries.service.js");
    return upsertFixedAppointmentOccurrence(
      fixedParsed.seriesId,
      fixedParsed.dateIso,
      {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
        ...(data.paymentSplits !== undefined ? { paymentSplits: data.paymentSplits } : {}),
        ...(data.paymentCompleted !== undefined ? { paymentCompleted: data.paymentCompleted } : {}),
        ...(data.paymentDate !== undefined ? { paymentDate: data.paymentDate } : {}),
        ...(data.specialistSettledAt !== undefined ? { specialistSettledAt: data.specialistSettledAt } : {}),
        ...(data.medicalRecord !== undefined ? { medicalRecord: data.medicalRecord } : {}),
        ...(data.reasonForVisit !== undefined ? { reasonForVisit: data.reasonForVisit } : {}),
        ...(data.reservationDepositAmount !== undefined
          ? { reservationDepositAmount: data.reservationDepositAmount }
          : {}),
        ...(data.patientConfirmationSource !== undefined
          ? { patientConfirmationSource: data.patientConfirmationSource }
          : {}),
      },
      role,
      userSpecialistId
    );
  }

  const existing = await appointmentRepository.findById(id);
  if (!existing) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, existing.specialistId);

  if (role === Role.SPECIALIST) {
    throw new AppError(403, "Los especialistas no pueden modificar turnos existentes");
  }

  const nextSpecialistId = data.specialistId ?? existing.specialistId;
  const nextStatus = data.status !== undefined ? data.status : existing.status;
  const nextConsultorio =
    nextStatus === AppointmentStatus.AUSENTE_CON_AVISO
      ? ""
      : data.consultorio !== undefined
        ? data.consultorio.trim()
        : existing.consultorio.trim();
  const nextDate = data.appointmentDate !== undefined ? toDateOnly(data.appointmentDate) : existing.appointmentDate;
  const nextStart = data.startTime !== undefined ? assertValidTime(data.startTime) : existing.startTime;
  const nextEnd = data.endTime !== undefined ? assertValidTime(data.endTime) : existing.endTime;
  if (nextStatus !== AppointmentStatus.AUSENTE_CON_AVISO && !nextConsultorio) {
    throw new AppError(400, "Debe indicar el consultorio");
  }

  assertEndAfterStart(nextStart, nextEnd);

  const statusAffectsConsultorio =
    data.status !== undefined &&
    (data.status === AppointmentStatus.AUSENTE_CON_AVISO || existing.status === AppointmentStatus.AUSENTE_CON_AVISO);

  if (
    data.specialistId ||
    data.consultorio !== undefined ||
    data.appointmentDate !== undefined ||
    data.startTime !== undefined ||
    data.endTime !== undefined ||
    statusAffectsConsultorio
  ) {
    const specialist = await specialistRepository.findById(nextSpecialistId);
    if (!specialist || !specialist.active) {
      throw new AppError(400, "Especialista inválido o inactivo");
    }
    assertInsideAvailability(specialist, nextDate, nextStart, nextEnd);
    await assertNoOverlap(nextSpecialistId, nextDate, nextStart, nextEnd, id);
    if (nextConsultorio.trim()) {
      await assertNoConsultorioOverlap(nextConsultorio, nextDate, nextStart, nextEnd, id);
    }
  }

  if (data.patientId) {
    const patient = await patientRepository.findById(data.patientId);
    if (!patient) throw new AppError(400, "Paciente no encontrado");
  }

  const specialistForFee = await specialistRepository.findById(nextSpecialistId);
  const fee = specialistForFee?.consultationFee ?? null;
  const depositFromBody =
    data.reservationDepositAmount !== undefined ? parseMoneyToDecimal(data.reservationDepositAmount) : undefined;
  const rawExistingDeposit = (existing as { reservationDepositAmount?: unknown }).reservationDepositAmount;
  const existingDeposit = parseMoneyToDecimal(
    rawExistingDeposit as string | number | Prisma.Decimal | null | undefined
  );

  const shouldPatchReservationDeposit = data.status !== undefined || data.reservationDepositAmount !== undefined;
  const nextReservationDeposit = shouldPatchReservationDeposit
    ? reservationDepositForStatus(nextStatus, depositFromBody, existingDeposit, fee)
    : undefined;

  const confirmationPatch =
    data.status !== undefined
      ? syncPatientConfirmationForStatusChange(
          nextStatus,
          existing.status,
          existing.patientConfirmedAt,
          existing.patientConfirmationSource,
          data.patientConfirmationSource
        )
      : {};

  const paymentPatch = resolvePaymentFields(data, existing);

  const updated = await appointmentRepository.update(id, {
    ...(data.patientId !== undefined ? { patient: { connect: { id: data.patientId } } } : {}),
    ...(data.specialistId !== undefined ? { specialist: { connect: { id: data.specialistId } } } : {}),
    ...(data.consultorio !== undefined || data.status !== undefined ? { consultorio: nextConsultorio } : {}),
    ...(data.appointmentDate !== undefined ? { appointmentDate: nextDate } : {}),
    ...(data.startTime !== undefined ? { startTime: nextStart } : {}),
    ...(data.endTime !== undefined ? { endTime: nextEnd } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...confirmationPatch,
    ...(nextReservationDeposit !== undefined ? { reservationDepositAmount: nextReservationDeposit } : {}),
    ...(paymentPatch
      ? { paymentMethod: paymentPatch.paymentMethod, paymentSplits: paymentPatch.paymentSplits }
      : {}),
    ...(data.paymentCompleted !== undefined ? { paymentCompleted: data.paymentCompleted } : {}),
    ...((data.paymentDate !== undefined || data.paymentCompleted === false)
      ? {
          paymentDate:
            data.paymentCompleted === false
              ? null
              : data.paymentDate !== undefined
                ? data.paymentDate
                : existing.paymentDate,
        }
      : {}),
    ...(data.specialistSettledAt !== undefined ? { specialistSettledAt: data.specialistSettledAt } : {}),
    ...(data.medicalRecord !== undefined ? { medicalRecord: data.medicalRecord?.trim() || null } : {}),
    ...(data.reasonForVisit !== undefined ? { reasonForVisit: data.reasonForVisit?.trim() || null } : {}),
  });

  void syncWhatsappReminderForAppointment({
    appointmentRef: updated.id,
    patientId: updated.patientId,
    specialistId: updated.specialistId,
    appointmentDate: updated.appointmentDate,
    startTime: updated.startTime,
    endTime: updated.endTime,
    consultorio: updated.consultorio,
    status: updated.status,
  }).catch(() => undefined);

  return updated;
}

export async function deleteAppointment(id: string, role: Role, userSpecialistId: string | null) {
  const existing = await appointmentRepository.findById(id);
  if (!existing) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, existing.specialistId);
  await cancelWhatsappRemindersForAppointment(id).catch(() => undefined);
  await appointmentRepository.delete(id);
}

