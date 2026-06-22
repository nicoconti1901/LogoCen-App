import {
  AppointmentPaymentMethod,
  AppointmentStatus,
  PatientConfirmationSource,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "../config/database.js";
import { fixedAppointmentSeriesRepository } from "../repositories/fixedAppointmentSeries.repository.js";
import { fixedAppointmentOccurrenceRepository } from "../repositories/fixedAppointmentOccurrence.repository.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { patientRepository } from "../repositories/patient.repository.js";
import { specialistRepository } from "../repositories/specialist.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { reservationDepositForStatus } from "./appointmentPayment.utils.js";
import {
  normalizeAppointmentPaymentFields,
  parseStoredPaymentSplits,
  type PaymentSplitInput,
} from "../utils/appointmentPaymentSplits.js";
import { syncPatientConfirmationForStatusChange } from "../utils/appointmentConfirmation.js";
import {
  assertValidTime,
  formatDateOnlyISO,
  formatStoredDateOnlyISO,
  parseDateOnlyISO,
  timeToMinutes,
  toDateOnly,
  weekdayFromDate,
} from "../utils/appointmentTime.js";
import {
  assertInsideAvailability,
  assertNoConsultorioOverlap,
  assertNoOverlap,
} from "./appointment.service.js";
import { assertNoConflictsForNewFixedSeries } from "../utils/fixedAppointmentScheduling.js";
import { PerfSpan } from "../utils/perfLog.js";
import {
  buildVirtualAppointmentForDate,
  iterateSeriesOccurrenceDates,
  parseFixedAppointmentId,
  buildFixedAppointmentId,
} from "../utils/fixedAppointmentOccurrences.js";

function parseMoneyToDecimal(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object" && value !== null && "toFixed" in value) {
    return new Prisma.Decimal(value as Prisma.Decimal);
  }
  const s = typeof value === "number" ? String(value) : String(value).trim().replace(",", ".");
  if (!s) return null;
  return new Prisma.Decimal(s);
}

function defaultPatientHistoryRange(): { from: Date; to: Date } {
  const from = toDateOnly(new Date());
  from.setFullYear(from.getFullYear() - 2);
  const to = toDateOnly(new Date());
  return { from, to };
}

const DISPLAY_DURATION_MIN = 30;
const DISPLAY_DURATION_MAX = 240;

function assertCanAccessSeries(
  role: Role,
  userSpecialistId: string | null,
  seriesSpecialistId: string
): void {
  if (role === Role.ADMIN) return;
  if (role === Role.SPECIALIST && userSpecialistId === seriesSpecialistId) return;
  throw new AppError(403, "No puede acceder a esta serie de turnos fijos");
}

function seriesEndTime(startTime: string, displayDurationMinutes: number): string {
  const endM = timeToMinutes(startTime) + displayDurationMinutes;
  const h = Math.floor(endM / 60);
  const m = endM % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function createFixedAppointmentSeries(
  data: {
    patientId: string;
    specialistId: string;
    consultorio: string;
    date: string;
    startTime: string;
    displayDurationMinutes?: number;
    effectiveUntil?: string | null;
    reasonForVisit?: string | null;
  },
  role: Role,
  userSpecialistId: string | null
) {
  const perf = new PerfSpan();

  if (role === Role.SPECIALIST) {
    if (!userSpecialistId || data.specialistId !== userSpecialistId) {
      throw new AppError(403, "Solo puede crear turnos fijos para usted mismo");
    }
  }

  const startTime = assertValidTime(data.startTime);
  const displayDurationMinutes = data.displayDurationMinutes ?? DISPLAY_DURATION_MIN;
  if (displayDurationMinutes < 15 || displayDurationMinutes > DISPLAY_DURATION_MAX) {
    throw new AppError(400, "Duración de visualización inválida (15–240 min)");
  }
  const endTime = seriesEndTime(startTime, displayDurationMinutes);
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new AppError(400, "La hora de fin debe ser posterior al inicio");
  }

  const consultorio = data.consultorio.trim();
  if (!consultorio) throw new AppError(400, "Debe indicar el consultorio");

  const effectiveFrom = parseDateOnlyISO(data.date);
  const weekday = weekdayFromDate(effectiveFrom);
  const effectiveUntil = data.effectiveUntil ? parseDateOnlyISO(data.effectiveUntil) : null;
  if (effectiveUntil && effectiveUntil < effectiveFrom) {
    throw new AppError(400, "La fecha de fin debe ser posterior o igual al inicio");
  }

  const specialist = await specialistRepository.findById(data.specialistId);
  if (!specialist || !specialist.active) {
    throw new AppError(400, "Especialista inválido o inactivo");
  }
  assertInsideAvailability(specialist, effectiveFrom, startTime, endTime);

  const patient = await patientRepository.findById(data.patientId);
  if (!patient) throw new AppError(400, "Paciente no encontrado");

  const duplicate = await fixedAppointmentSeriesRepository.findActiveByPatientSpecialistWeekday({
    patientId: data.patientId,
    specialistId: data.specialistId,
    weekday,
    startTime,
  });
  if (duplicate) {
    throw new AppError(
      409,
      "Este paciente ya tiene un turno fijo activo el mismo día y hora con este especialista"
    );
  }

  perf.mark("validated");

  const occurrenceDates = iterateSeriesOccurrenceDates({
    weekday,
    effectiveFrom,
    effectiveUntil,
  });

  await assertNoConflictsForNewFixedSeries({
    specialistId: data.specialistId,
    consultorio,
    weekday,
    effectiveFrom,
    effectiveUntil,
    startTime,
    endTime,
    maxWeeks: occurrenceDates.length,
  });

  perf.mark("conflicts");

  const created = await fixedAppointmentSeriesRepository.create({
    patientId: data.patientId,
    specialistId: data.specialistId,
    consultorio,
    weekday,
    startTime,
    displayDurationMinutes,
    effectiveFrom,
    effectiveUntil,
    reasonForVisit: data.reasonForVisit,
  });

  void import("./whatsappReminder.service.js")
    .then(({ syncWhatsappRemindersForFixedSeries }) =>
      syncWhatsappRemindersForFixedSeries(created.id)
    )
    .catch(() => undefined);

  perf.finish({ op: "fixed-series.create", seriesId: created.id });

  return created;
}

/** Si la serie ya fue dada de baja, devuelve la activa del mismo paciente y especialista. */
async function resolveActiveFixedSeries(seriesId: string) {
  const series = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!series) throw new AppError(404, "Serie de turno fijo no encontrada");
  if (series.active) return series;

  const replacement = await prisma.fixedAppointmentSeries.findFirst({
    where: {
      active: true,
      patientId: series.patientId,
      specialistId: series.specialistId,
    },
    orderBy: { createdAt: "desc" },
  });
  if (replacement) return replacement;
  throw new AppError(404, "Serie de turno fijo no encontrada");
}

export async function getFixedAppointmentSeriesById(
  seriesId: string,
  role: Role,
  userSpecialistId: string | null
) {
  const series = await resolveActiveFixedSeries(seriesId);
  assertCanAccessSeries(role, userSpecialistId, series.specialistId);
  return series;
}

/**
 * Cambia horario/consultorio/duración de una serie fija: da de baja la serie anterior
 * (turnos futuros del horario viejo) y crea una nueva desde `fromDate`.
 */
export async function rescheduleFixedAppointmentSeries(
  seriesId: string,
  data: {
    consultorio: string;
    startTime: string;
    displayDurationMinutes: number;
    effectiveUntil?: string | null;
    fromDate: string;
  },
  role: Role,
  userSpecialistId: string | null
) {
  const perf = new PerfSpan();
  const series = await resolveActiveFixedSeries(seriesId);
  assertCanAccessSeries(role, userSpecialistId, series.specialistId);

  const startTime = assertValidTime(data.startTime);
  const displayDurationMinutes = data.displayDurationMinutes;
  if (displayDurationMinutes < 15 || displayDurationMinutes > DISPLAY_DURATION_MAX) {
    throw new AppError(400, "Duración de visualización inválida (15–240 min)");
  }
  const endTime = seriesEndTime(startTime, displayDurationMinutes);
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new AppError(400, "La hora de fin debe ser posterior al inicio");
  }

  const consultorio = data.consultorio.trim();
  if (!consultorio) throw new AppError(400, "Debe indicar el consultorio");

  const fromDate = parseDateOnlyISO(data.fromDate);
  const today = toDateOnly(new Date());
  if (fromDate < today) {
    throw new AppError(400, "La fecha de inicio del nuevo horario debe ser hoy o posterior");
  }

  const specialist = await specialistRepository.findById(series.specialistId);
  if (!specialist || !specialist.active) {
    throw new AppError(400, "Especialista inválido o inactivo");
  }
  assertInsideAvailability(specialist, fromDate, startTime, endTime);

  const effectiveUntil = data.effectiveUntil ? parseDateOnlyISO(data.effectiveUntil) : null;
  if (effectiveUntil && effectiveUntil < fromDate) {
    throw new AppError(400, "La fecha de fin debe ser posterior o igual al inicio");
  }

  const weekday = weekdayFromDate(fromDate);

  const untilOld = new Date(fromDate);
  untilOld.setDate(untilOld.getDate() - 1);
  const oldUntil = toDateOnly(untilOld);
  const deactivateUntil =
    oldUntil >= toDateOnly(series.effectiveFrom) ? oldUntil : toDateOnly(series.effectiveFrom);

  const activesForPatient = await prisma.fixedAppointmentSeries.findMany({
    where: {
      active: true,
      patientId: series.patientId,
      specialistId: series.specialistId,
    },
  });
  const rollbackStates = activesForPatient.map((s) => ({
    id: s.id,
    active: s.active,
    effectiveUntil: s.effectiveUntil,
  }));

  // Baja todas las series activas del paciente con este especialista (evita duplicados históricos).
  for (const s of activesForPatient) {
    const until =
      deactivateUntil >= toDateOnly(s.effectiveFrom) ? deactivateUntil : toDateOnly(s.effectiveFrom);
    await fixedAppointmentSeriesRepository.deactivate(s.id, until);
  }

  perf.mark("deactivated");

  const conflictExclude = {
    excludePatientSpecialist: {
      patientId: series.patientId,
      specialistId: series.specialistId,
    },
  };

  try {
    // Una fecha alcanza para turnos semanales (mismo día de la semana en toda la serie).
    await assertNoOverlap(
      series.specialistId,
      fromDate,
      startTime,
      endTime,
      undefined,
      conflictExclude
    );
    await assertNoConsultorioOverlap(
      consultorio,
      fromDate,
      startTime,
      endTime,
      undefined,
      conflictExclude
    );

    perf.mark("conflicts");

    const created = await fixedAppointmentSeriesRepository.create({
      patientId: series.patientId,
      specialistId: series.specialistId,
      consultorio,
      weekday,
      startTime,
      displayDurationMinutes,
      effectiveFrom: fromDate,
      effectiveUntil,
      reasonForVisit: series.reasonForVisit,
    });

    void import("./whatsappReminder.service.js")
      .then(({ syncWhatsappRemindersForFixedSeries }) =>
        syncWhatsappRemindersForFixedSeries(created.id)
      )
      .catch(() => undefined);

    perf.finish({ op: "fixed-series.reschedule", seriesId: created.id });

    return created;
  } catch (err) {
    for (const prev of rollbackStates) {
      await prisma.fixedAppointmentSeries.update({
        where: { id: prev.id },
        data: {
          active: prev.active,
          effectiveUntil: prev.effectiveUntil,
        },
      });
    }
    throw err;
  }
}

export async function cancelFixedAppointmentSeries(
  seriesId: string,
  role: Role,
  userSpecialistId: string | null
) {
  const series = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!series) throw new AppError(404, "Serie de turno fijo no encontrada");
  assertCanAccessSeries(role, userSpecialistId, series.specialistId);
  if (!series.active) return series;

  const today = toDateOnly(new Date());
  const until =
    series.effectiveUntil && toDateOnly(series.effectiveUntil) < today
      ? toDateOnly(series.effectiveUntil)
      : today;
  const deactivated = await fixedAppointmentSeriesRepository.deactivate(seriesId, until);
  void import("./whatsappReminder.service.js")
    .then(({ cancelWhatsappRemindersForFixedSeries }) => cancelWhatsappRemindersForFixedSeries(seriesId))
    .catch(() => undefined);
  return deactivated;
}

export async function skipFixedAppointmentOccurrence(
  seriesId: string,
  dateIso: string,
  role: Role,
  userSpecialistId: string | null
) {
  const series = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!series) throw new AppError(404, "Serie de turno fijo no encontrada");
  assertCanAccessSeries(role, userSpecialistId, series.specialistId);
  if (!series.active) throw new AppError(400, "La serie de turno fijo ya está cancelada");

  const skipDate = parseDateOnlyISO(dateIso);
  if (weekdayFromDate(skipDate) !== series.weekday) {
    throw new AppError(400, "La fecha no coincide con el día de la semana del turno fijo");
  }
  if (skipDate < toDateOnly(series.effectiveFrom)) {
    throw new AppError(400, "La fecha es anterior al inicio de la serie");
  }
  if (series.effectiveUntil && skipDate > toDateOnly(series.effectiveUntil)) {
    throw new AppError(400, "La fecha es posterior al fin de la serie");
  }

  try {
    await fixedAppointmentSeriesRepository.addSkip(seriesId, skipDate);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: true };
    }
    throw e;
  }
  void import("./whatsappReminder.service.js")
    .then(({ cancelWhatsappRemindersForAppointment }) =>
      cancelWhatsappRemindersForAppointment(buildFixedAppointmentId(seriesId, formatDateOnlyISO(skipDate)))
    )
    .catch(() => undefined);
  return { ok: true };
}

export async function listActiveFixedSeriesForPatient(patientId: string, specialistId?: string) {
  const rows = await fixedAppointmentSeriesRepository.findActiveOverlappingRange({
    patientId,
    specialistId,
  });
  return rows;
}

/** Ocurrencias virtuales para mezclar en listAppointments. */
export async function expandFixedAppointmentsForRange(params: {
  rangeFrom?: Date;
  rangeTo?: Date;
  specialistId?: string;
  patientId?: string;
  realAppointments: Awaited<ReturnType<typeof appointmentRepository.findMany>>;
  /** Historial / resumen de pagos del paciente (sin rango de agenda). */
  forPaymentSummary?: boolean;
}) {
  let from = params.rangeFrom;
  let to = params.rangeTo;
  const forPaymentSummary = params.forPaymentSummary ?? false;
  if (!from && !to) {
    if (!params.patientId) return [];
    const def = defaultPatientHistoryRange();
    from = def.from;
    to = def.to;
  } else {
    from = from ?? to!;
    to = to ?? from!;
  }
  const seriesList = await fixedAppointmentSeriesRepository.findActiveForAgenda({
    specialistId: params.specialistId,
    patientId: params.patientId,
    rangeFrom: from,
    rangeTo: to,
  });
  const { expandFixedSeriesToVirtualAppointments } = await import("../utils/fixedAppointmentOccurrences.js");
  return expandFixedSeriesToVirtualAppointments({
    seriesList,
    rangeFrom: from,
    rangeTo: to,
    realAppointments: params.realAppointments,
    forPaymentSummary,
  });
}

export async function getFixedVirtualAppointmentById(
  virtualId: string,
  role: Role,
  userSpecialistId: string | null
) {
  const parsed = parseFixedAppointmentId(virtualId);
  if (!parsed) throw new AppError(404, "Cita no encontrada");

  const series = await fixedAppointmentSeriesRepository.findById(parsed.seriesId);
  if (!series || !series.active) throw new AppError(404, "Serie de turno fijo no encontrada");
  assertCanAccessSeries(role, userSpecialistId, series.specialistId);

  const occurrenceDate = parseDateOnlyISO(parsed.dateIso);
  if (weekdayFromDate(occurrenceDate) !== series.weekday) {
    throw new AppError(404, "Cita no encontrada");
  }
  if (occurrenceDate < toDateOnly(series.effectiveFrom)) {
    throw new AppError(404, "Cita no encontrada");
  }
  if (series.effectiveUntil && occurrenceDate > toDateOnly(series.effectiveUntil)) {
    throw new AppError(404, "Cita no encontrada");
  }
  if (series.skips.some((s) => formatStoredDateOnlyISO(s.skipDate) === parsed.dateIso)) {
    throw new AppError(404, "Cita no encontrada");
  }

  const occ = await fixedAppointmentOccurrenceRepository.findBySeriesAndDate(parsed.seriesId, occurrenceDate);
  return buildVirtualAppointmentForDate(series, occurrenceDate, occ);
}

export async function upsertFixedAppointmentOccurrence(
  seriesId: string,
  dateIso: string,
  data: Partial<{
    status: AppointmentStatus;
    paymentMethod: AppointmentPaymentMethod | null;
    paymentSplits?: PaymentSplitInput[] | null;
    paymentCompleted: boolean;
    paymentDate: Date | null;
    specialistSettledAt: Date | null;
    medicalRecord: string | null;
    reasonForVisit: string | null;
    reservationDepositAmount: string | number | null;
    patientConfirmationSource: PatientConfirmationSource | null;
  }>,
  role: Role,
  userSpecialistId: string | null
) {
  if (role === Role.SPECIALIST) {
    throw new AppError(403, "Los especialistas no pueden modificar turnos existentes");
  }

  const series = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!series || !series.active) throw new AppError(404, "Serie de turno fijo no encontrada");
  assertCanAccessSeries(role, userSpecialistId, series.specialistId);

  const occurrenceDate = parseDateOnlyISO(dateIso);
  if (weekdayFromDate(occurrenceDate) !== series.weekday) {
    throw new AppError(400, "La fecha no coincide con el día de la semana del turno fijo");
  }
  if (occurrenceDate < toDateOnly(series.effectiveFrom)) {
    throw new AppError(400, "La fecha es anterior al inicio de la serie");
  }
  if (series.effectiveUntil && occurrenceDate > toDateOnly(series.effectiveUntil)) {
    throw new AppError(400, "La fecha es posterior al fin de la serie");
  }
  if (series.skips.some((s) => formatStoredDateOnlyISO(s.skipDate) === dateIso)) {
    throw new AppError(400, "Ese día está cancelado en la serie fija");
  }

  const existing = await fixedAppointmentOccurrenceRepository.findBySeriesAndDate(seriesId, occurrenceDate);
  const today = toDateOnly(new Date());
  const defaultStatus =
    !existing && occurrenceDate < today ? AppointmentStatus.ATTENDED : AppointmentStatus.RESERVED;
  const previousStatus = existing?.status ?? defaultStatus;
  const nextStatus = data.status ?? previousStatus;
  const isAusenteConAviso = nextStatus === AppointmentStatus.AUSENTE_CON_AVISO;

  const confirmationPatch =
    data.status !== undefined
      ? syncPatientConfirmationForStatusChange(
          nextStatus,
          previousStatus,
          existing?.patientConfirmedAt ?? null,
          existing?.patientConfirmationSource ?? null,
          data.patientConfirmationSource
        )
      : {};

  const specialist = await specialistRepository.findById(series.specialistId);
  const fee = specialist?.consultationFee ?? null;
  const depositFromBody =
    data.reservationDepositAmount !== undefined ? parseMoneyToDecimal(data.reservationDepositAmount) : undefined;
  const existingDeposit = parseMoneyToDecimal(existing?.reservationDepositAmount ?? null);
  const shouldPatchReservationDeposit =
    data.status !== undefined || data.reservationDepositAmount !== undefined;
  const nextReservationDeposit = shouldPatchReservationDeposit
    ? reservationDepositForStatus(nextStatus, depositFromBody, existingDeposit, fee)
    : existing?.reservationDepositAmount ?? null;

  const paymentCompleted = data.paymentCompleted ?? existing?.paymentCompleted ?? false;

  let paymentMethod = existing?.paymentMethod ?? null;
  let paymentSplits: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
  if (data.paymentSplits !== undefined || data.paymentMethod !== undefined) {
    const normalized = normalizeAppointmentPaymentFields({
      paymentMethod:
        data.paymentMethod !== undefined ? data.paymentMethod : (existing?.paymentMethod ?? null),
      paymentSplits:
        data.paymentSplits !== undefined
          ? data.paymentSplits
          : parseStoredPaymentSplits(existing?.paymentSplits),
    });
    paymentMethod = normalized.paymentMethod;
    paymentSplits = normalized.paymentSplits;
  }

  await fixedAppointmentOccurrenceRepository.upsert(seriesId, occurrenceDate, {
    status: nextStatus,
    reservationDepositAmount: nextReservationDeposit,
    paymentMethod,
    ...(paymentSplits !== undefined ? { paymentSplits } : {}),
    paymentCompleted,
    paymentDate:
      data.paymentCompleted === false
        ? null
        : data.paymentDate !== undefined
          ? data.paymentDate
          : paymentCompleted
            ? (existing?.paymentDate ?? occurrenceDate)
            : null,
    specialistSettledAt:
      data.specialistSettledAt !== undefined
        ? data.specialistSettledAt
        : (existing?.specialistSettledAt ?? null),
    medicalRecord:
      data.medicalRecord !== undefined
        ? data.medicalRecord?.trim() || null
        : (existing?.medicalRecord ?? null),
    reasonForVisit:
      data.reasonForVisit !== undefined
        ? data.reasonForVisit?.trim() || null
        : (existing?.reasonForVisit ?? null),
    ...confirmationPatch,
  });

  const refreshed = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!refreshed) throw new AppError(404, "Serie de turno fijo no encontrada");
  const occ = await fixedAppointmentOccurrenceRepository.findBySeriesAndDate(seriesId, occurrenceDate);
  void import("./whatsappReminder.service.js")
    .then(({ syncWhatsappReminderForFixedOccurrenceDate }) =>
      syncWhatsappReminderForFixedOccurrenceDate(seriesId, dateIso)
    )
    .catch(() => undefined);
  return buildVirtualAppointmentForDate(refreshed, occurrenceDate, occ);
}
