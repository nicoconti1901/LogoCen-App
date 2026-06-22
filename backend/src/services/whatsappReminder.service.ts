import {
  AppointmentStatus,
  PatientConfirmationSource,
  WhatsappReminderKind,
} from "@prisma/client";
import { isWhatsappConfigured } from "../config/whatsapp.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { fixedAppointmentOccurrenceRepository } from "../repositories/fixedAppointmentOccurrence.repository.js";
import { fixedAppointmentSeriesRepository } from "../repositories/fixedAppointmentSeries.repository.js";
import { patientRepository } from "../repositories/patient.repository.js";
import { whatsappReminderRepository } from "../repositories/whatsappReminder.repository.js";
import { syncPatientConfirmationForStatusChange } from "../utils/appointmentConfirmation.js";
import {
  formatDateOnlyISO,
  formatStoredDateOnlyISO,
  minutesToHHmm,
  parseDateOnlyISO,
  timeToMinutes,
  toDateOnly,
} from "../utils/appointmentTime.js";
import {
  buildFixedAppointmentId,
  iterateSeriesOccurrenceDates,
  parseFixedAppointmentId,
} from "../utils/fixedAppointmentOccurrences.js";
import { buildReminderBody, isWhatsappConfirmText } from "../whatsapp/messageBuilder.js";
import { sendConfirmationReminderMessage } from "../whatsapp/metaClient.js";
import { normalizePhoneToE164, whatsappPhonesMatch } from "../whatsapp/phone.js";
import {
  appointmentStartInstant,
  planWhatsappReminder,
  shouldAutoConfirmWithoutWhatsapp,
} from "../whatsapp/reminderSchedule.js";

/** Cuántas semanas hacia adelante se programan recordatorios de turnos fijos. */
const FIXED_SERIES_REMINDER_HORIZON_WEEKS = 16;

function seriesEndTimeForReminder(startTime: string, displayDurationMinutes: number): string {
  return minutesToHHmm(timeToMinutes(startTime) + displayDurationMinutes);
}

async function syncWhatsappReminderForFixedOccurrence(
  series: NonNullable<Awaited<ReturnType<typeof fixedAppointmentSeriesRepository.findById>>>,
  occurrenceDate: Date,
  cached?: {
    patientPhone?: string | null;
    occurrenceByDate?: Map<string, AppointmentStatus>;
  }
): Promise<void> {
  if (!series.active) return;

  const dateIso = formatDateOnlyISO(occurrenceDate);
  if (series.skips.some((s) => formatStoredDateOnlyISO(s.skipDate) === dateIso)) {
    await cancelWhatsappRemindersForAppointment(buildFixedAppointmentId(series.id, dateIso));
    return;
  }

  let status: AppointmentStatus = AppointmentStatus.RESERVED;
  if (cached?.occurrenceByDate) {
    status = cached.occurrenceByDate.get(dateIso) ?? AppointmentStatus.RESERVED;
  } else {
    const occ = await fixedAppointmentOccurrenceRepository.findBySeriesAndDate(series.id, occurrenceDate);
    status = occ?.status ?? AppointmentStatus.RESERVED;
  }

  await syncWhatsappReminderForAppointment(
    {
      appointmentRef: buildFixedAppointmentId(series.id, dateIso),
      patientId: series.patientId,
      specialistId: series.specialistId,
      appointmentDate: occurrenceDate,
      startTime: series.startTime,
      endTime: seriesEndTimeForReminder(series.startTime, series.displayDurationMinutes),
      consultorio: series.consultorio,
      status,
    },
    cached?.patientPhone !== undefined ? { patientPhone: cached.patientPhone } : undefined
  );
}

/** Programa recordatorios para las próximas ocurrencias de una serie fija activa. */
export async function syncWhatsappRemindersForFixedSeries(seriesId: string): Promise<void> {
  const series = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!series || !series.active) return;

  const today = toDateOnly(new Date());
  const rangeFrom = toDateOnly(series.effectiveFrom) > today ? toDateOnly(series.effectiveFrom) : today;
  const rangeTo = series.effectiveUntil ? toDateOnly(series.effectiveUntil) : null;
  const occurrenceDates = iterateSeriesOccurrenceDates({
    weekday: series.weekday,
    effectiveFrom: rangeFrom,
    effectiveUntil: rangeTo,
    maxWeeks: FIXED_SERIES_REMINDER_HORIZON_WEEKS,
  });
  if (!occurrenceDates.length) return;

  const hardEnd = occurrenceDates[occurrenceDates.length - 1]!;
  const [patient, occurrences] = await Promise.all([
    patientRepository.findById(series.patientId),
    fixedAppointmentOccurrenceRepository.findManyForSeriesInRange(seriesId, rangeFrom, hardEnd),
  ]);
  const patientPhone = patient?.phone ?? null;
  const occByDate = new Map(
    occurrences.map((o) => [formatStoredDateOnlyISO(o.occurrenceDate), o.status])
  );

  for (const occurrenceDate of occurrenceDates) {
    await syncWhatsappReminderForFixedOccurrence(series, occurrenceDate, {
      patientPhone,
      occurrenceByDate: occByDate,
    }).catch(() => undefined);
  }
}

export async function syncWhatsappReminderForFixedOccurrenceDate(
  seriesId: string,
  dateIso: string
): Promise<void> {
  const series = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!series) return;
  await syncWhatsappReminderForFixedOccurrence(series, parseDateOnlyISO(dateIso));
}

/** Asegura recordatorios de todas las series fijas activas (cron / mantenimiento). */
export async function refreshActiveFixedSeriesReminderSchedule(): Promise<number> {
  const actives = await fixedAppointmentSeriesRepository.findActiveOverlappingRange({});
  let count = 0;
  for (const series of actives) {
    await syncWhatsappRemindersForFixedSeries(series.id).catch(() => undefined);
    count++;
  }
  return count;
}

export async function cancelWhatsappRemindersForFixedSeries(seriesId: string): Promise<void> {
  const series = await fixedAppointmentSeriesRepository.findById(seriesId);
  if (!series) return;

  const occurrenceDates = iterateSeriesOccurrenceDates({
    weekday: series.weekday,
    effectiveFrom: toDateOnly(series.effectiveFrom),
    effectiveUntil: series.effectiveUntil ? toDateOnly(series.effectiveUntil) : null,
    maxWeeks: FIXED_SERIES_REMINDER_HORIZON_WEEKS,
  });

  for (const occurrenceDate of occurrenceDates) {
    const ref = buildFixedAppointmentId(seriesId, formatDateOnlyISO(occurrenceDate));
    await cancelWhatsappRemindersForAppointment(ref).catch(() => undefined);
  }
}

export type AppointmentReminderTarget = {
  appointmentRef: string;
  patientId: string;
  specialistId: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  consultorio: string;
  status: AppointmentStatus;
};

/** Programa recordatorio 24 h antes, o confirma sin WhatsApp si el turno es en menos de 48 h. */
export async function syncWhatsappReminderForAppointment(
  target: AppointmentReminderTarget,
  cached?: { patientPhone?: string | null }
): Promise<void> {
  await whatsappReminderRepository.cancelPendingForAppointment(target.appointmentRef);

  if (target.status !== AppointmentStatus.RESERVED) return;

  const now = new Date();

  if (shouldAutoConfirmWithoutWhatsapp(target.appointmentDate, target.startTime, now)) {
    await autoConfirmAppointmentWithoutWhatsapp(target);
    return;
  }

  let patientPhone = cached?.patientPhone;
  if (patientPhone === undefined) {
    const patient = await patientRepository.findById(target.patientId);
    patientPhone = patient?.phone ?? null;
  }
  if (!patientPhone?.trim()) return;

  const plan = planWhatsappReminder(target.appointmentDate, target.startTime, now);
  if (!plan) return;

  await whatsappReminderRepository.upsertScheduled({
    appointmentRef: target.appointmentRef,
    patientId: target.patientId,
    kind: plan.kind,
    scheduledSendAt: plan.scheduledSendAt,
  });
}

/** Menos de 48 h al turno: sin mensaje; pasa a CONFIRMADO (origen manual / carga en recepción). */
async function autoConfirmAppointmentWithoutWhatsapp(
  target: AppointmentReminderTarget
): Promise<void> {
  const fixed = parseFixedAppointmentId(target.appointmentRef);
  if (fixed) {
    const occurrenceDate = parseDateOnlyISO(fixed.dateIso);
    const existing = await fixedAppointmentOccurrenceRepository.findBySeriesAndDate(
      fixed.seriesId,
      occurrenceDate
    );
    if ((existing?.status ?? AppointmentStatus.RESERVED) !== AppointmentStatus.RESERVED) return;

    const patch = syncPatientConfirmationForStatusChange(
      AppointmentStatus.CONFIRMADO,
      existing?.status ?? AppointmentStatus.RESERVED,
      existing?.patientConfirmedAt ?? null,
      existing?.patientConfirmationSource ?? null,
      PatientConfirmationSource.MANUAL
    );
    await fixedAppointmentOccurrenceRepository.upsert(fixed.seriesId, occurrenceDate, {
      status: AppointmentStatus.CONFIRMADO,
      ...patch,
      reservationDepositAmount: existing?.reservationDepositAmount ?? null,
      paymentMethod: existing?.paymentMethod ?? null,
      paymentCompleted: existing?.paymentCompleted ?? false,
      paymentDate: existing?.paymentDate ?? null,
      specialistSettledAt: existing?.specialistSettledAt ?? null,
      medicalRecord: existing?.medicalRecord ?? null,
      reasonForVisit: existing?.reasonForVisit ?? null,
    });
    return;
  }

  const appt = await appointmentRepository.findById(target.appointmentRef);
  if (!appt || appt.status !== AppointmentStatus.RESERVED) return;

  const patch = syncPatientConfirmationForStatusChange(
    AppointmentStatus.CONFIRMADO,
    appt.status,
    appt.patientConfirmedAt,
    appt.patientConfirmationSource,
    PatientConfirmationSource.MANUAL
  );

  await appointmentRepository.update(target.appointmentRef, {
    status: AppointmentStatus.CONFIRMADO,
    ...patch,
  });
}

export async function cancelWhatsappRemindersForAppointment(appointmentRef: string): Promise<void> {
  await whatsappReminderRepository.cancelPendingForAppointment(appointmentRef);
}

export async function processDueWhatsappReminders(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  fixedSeriesSynced: number;
}> {
  const fixedSeriesSynced = await refreshActiveFixedSeriesReminderSchedule().catch(() => 0);

  const due = await whatsappReminderRepository.findDue(new Date());
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const reminder of due) {
    const result = await sendSingleReminder(
      reminder.id,
      reminder.appointmentRef,
      reminder.patientId,
      reminder.kind
    );
    if (result === "sent") sent++;
    else if (result === "failed") failed++;
    else skipped++;
  }

  return { processed: due.length, sent, failed, skipped, fixedSeriesSynced };
}

async function sendSingleReminder(
  reminderId: string,
  appointmentRef: string,
  patientId: string,
  kind: WhatsappReminderKind
): Promise<"sent" | "failed" | "skipped"> {
  if (!isWhatsappConfigured()) {
    await whatsappReminderRepository.markSkipped(reminderId, "WhatsApp deshabilitado o sin credenciales");
    return "skipped";
  }

  const ctx = await loadReminderContext(appointmentRef, patientId);
  if (!ctx) {
    await whatsappReminderRepository.markSkipped(reminderId, "Turno no encontrado");
    return "skipped";
  }

  if (ctx.status !== AppointmentStatus.RESERVED) {
    await whatsappReminderRepository.markSkipped(reminderId, `Estado del turno: ${ctx.status}`);
    return "skipped";
  }

  const phone = normalizePhoneToE164(ctx.patientPhone);
  if (!phone) {
    await whatsappReminderRepository.markSkipped(reminderId, "Teléfono del paciente inválido");
    return "skipped";
  }

  const start = appointmentStartInstant(ctx.appointmentDate, ctx.startTime);
  if (start.getTime() <= Date.now()) {
    await whatsappReminderRepository.markSkipped(reminderId, "Turno ya comenzó o pasó");
    return "skipped";
  }

  const body = buildReminderBody({
    patientFirstName: ctx.patientFirstName,
    appointmentDate: ctx.appointmentDate,
    startTime: ctx.startTime,
    endTime: ctx.endTime,
    specialistName: ctx.specialistName,
    consultorio: ctx.consultorio,
    kind,
  });

  const send = await sendConfirmationReminderMessage(
    phone,
    body,
    appointmentRef,
    {
      patientFirstName: ctx.patientFirstName,
      appointmentDate: ctx.appointmentDate,
      startTime: ctx.startTime,
      endTime: ctx.endTime,
      specialistName: ctx.specialistName,
      consultorio: ctx.consultorio,
      kind,
    }
  );
  if (!send.ok) {
    await whatsappReminderRepository.markFailed(reminderId, send.error);
    return "failed";
  }

  await whatsappReminderRepository.markSent(reminderId, send.messageId);
  return "sent";
}

type ReminderContext = {
  status: AppointmentStatus;
  patientPhone: string;
  patientFirstName: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  specialistName: string;
  consultorio: string;
};

async function loadReminderContext(
  appointmentRef: string,
  patientId: string
): Promise<ReminderContext | null> {
  const fixed = parseFixedAppointmentId(appointmentRef);
  if (fixed) {
    const series = await fixedAppointmentSeriesRepository.findById(fixed.seriesId);
    if (!series || series.patientId !== patientId || !series.active) return null;

    const occurrenceDate = parseDateOnlyISO(fixed.dateIso);
    const occ = await fixedAppointmentOccurrenceRepository.findBySeriesAndDate(
      fixed.seriesId,
      occurrenceDate
    );
    const endTime = minutesToHHmm(
      timeToMinutes(series.startTime) + series.displayDurationMinutes
    );

    return {
      status: occ?.status ?? AppointmentStatus.RESERVED,
      patientPhone: series.patient.phone ?? "",
      patientFirstName: series.patient.firstName,
      appointmentDate: occurrenceDate,
      startTime: series.startTime,
      endTime,
      specialistName: `${series.specialist.lastName}, ${series.specialist.firstName}`,
      consultorio: series.consultorio,
    };
  }

  const appt = await appointmentRepository.findById(appointmentRef);
  if (!appt || appt.patientId !== patientId) return null;

  return {
    status: appt.status,
    patientPhone: appt.patient.phone ?? "",
    patientFirstName: appt.patient.firstName,
    appointmentDate: appt.appointmentDate,
    startTime: appt.startTime,
    endTime: appt.endTime,
    specialistName: `${appt.specialist.lastName}, ${appt.specialist.firstName}`,
    consultorio: appt.consultorio,
  };
}

/** Confirma turno cuando el paciente toca el botón en WhatsApp. */
export async function confirmAppointmentFromWhatsapp(appointmentRef: string): Promise<boolean> {
  const fixed = parseFixedAppointmentId(appointmentRef);
  if (fixed) {
    const occurrenceDate = parseDateOnlyISO(fixed.dateIso);
    const existing = await fixedAppointmentOccurrenceRepository.findBySeriesAndDate(
      fixed.seriesId,
      occurrenceDate
    );
    const previousStatus = existing?.status ?? AppointmentStatus.RESERVED;
    if (previousStatus !== AppointmentStatus.RESERVED) return false;
    const patch = syncPatientConfirmationForStatusChange(
      AppointmentStatus.CONFIRMADO,
      previousStatus,
      existing?.patientConfirmedAt ?? null,
      existing?.patientConfirmationSource ?? null,
      PatientConfirmationSource.WHATSAPP
    );
    await fixedAppointmentOccurrenceRepository.upsert(fixed.seriesId, occurrenceDate, {
      status: AppointmentStatus.CONFIRMADO,
      ...patch,
      reservationDepositAmount: existing?.reservationDepositAmount ?? null,
      paymentMethod: existing?.paymentMethod ?? null,
      paymentCompleted: existing?.paymentCompleted ?? false,
      paymentDate: existing?.paymentDate ?? null,
      specialistSettledAt: existing?.specialistSettledAt ?? null,
      medicalRecord: existing?.medicalRecord ?? null,
      reasonForVisit: existing?.reasonForVisit ?? null,
    });
    await cancelWhatsappRemindersForAppointment(appointmentRef);
    return true;
  }

  const appt = await appointmentRepository.findById(appointmentRef);
  if (!appt) return false;
  if (appt.status !== AppointmentStatus.RESERVED) return false;

  const patch = syncPatientConfirmationForStatusChange(
    AppointmentStatus.CONFIRMADO,
    appt.status,
    appt.patientConfirmedAt,
    appt.patientConfirmationSource,
    PatientConfirmationSource.WHATSAPP
  );

  await appointmentRepository.update(appointmentRef, {
    status: AppointmentStatus.CONFIRMADO,
    ...patch,
  });
  await cancelWhatsappRemindersForAppointment(appointmentRef);
  return true;
}

/** Confirma el turno más reciente cuando el paciente responde CONFIRMO por texto. */
export async function confirmAppointmentFromWhatsappTextReply(
  waFrom: string,
  text: string
): Promise<boolean> {
  if (!isWhatsappConfirmText(text)) return false;

  const sentReminders = await whatsappReminderRepository.findRecentSent(20);
  for (const reminder of sentReminders) {
    if (!whatsappPhonesMatch(reminder.patientPhone, waFrom)) continue;
    if (await confirmAppointmentFromWhatsapp(reminder.appointmentRef)) return true;
  }

  const upcoming = await appointmentRepository.findUpcomingReserved(toDateOnly(new Date()));
  for (const appt of upcoming) {
    if (!whatsappPhonesMatch(appt.patient.phone, waFrom)) continue;
    if (await confirmAppointmentFromWhatsapp(appt.id)) return true;
  }

  return false;
}
