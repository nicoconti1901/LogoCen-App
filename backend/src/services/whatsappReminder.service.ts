import {
  AppointmentStatus,
  PatientConfirmationSource,
  Role,
  WhatsappReminderKind,
} from "@prisma/client";
import { isWhatsappConfigured, whatsappConfig } from "../config/whatsapp.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { fixedAppointmentOccurrenceRepository } from "../repositories/fixedAppointmentOccurrence.repository.js";
import { fixedAppointmentSeriesRepository } from "../repositories/fixedAppointmentSeries.repository.js";
import { patientRepository } from "../repositories/patient.repository.js";
import { whatsappReminderRepository } from "../repositories/whatsappReminder.repository.js";
import { syncPatientConfirmationForStatusChange } from "../utils/appointmentConfirmation.js";
import { parseDateOnlyISO, minutesToHHmm, timeToMinutes } from "../utils/appointmentTime.js";
import { parseFixedAppointmentId } from "../utils/fixedAppointmentOccurrences.js";
import { buildReminderBody } from "../whatsapp/messageBuilder.js";
import { sendConfirmationReminderMessage } from "../whatsapp/metaClient.js";
import { normalizePhoneToE164 } from "../whatsapp/phone.js";
import { appointmentStartInstant, planWhatsappReminder } from "../whatsapp/reminderSchedule.js";
import { upsertFixedAppointmentOccurrence } from "./fixedAppointmentSeries.service.js";

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

/** Programa o reprograma el recordatorio según fecha/hora del turno. */
export async function syncWhatsappReminderForAppointment(
  target: AppointmentReminderTarget
): Promise<void> {
  await whatsappReminderRepository.cancelPendingForAppointment(target.appointmentRef);

  if (target.status !== AppointmentStatus.RESERVED) return;

  const patient = await patientRepository.findById(target.patientId);
  if (!patient?.phone?.trim()) return;

  const plan = planWhatsappReminder(
    target.appointmentDate,
    target.startTime,
    new Date(),
    whatsappConfig.shortNoticeDelayMinutes
  );
  if (!plan) return;

  await whatsappReminderRepository.upsertScheduled({
    appointmentRef: target.appointmentRef,
    patientId: target.patientId,
    kind: plan.kind,
    scheduledSendAt: plan.scheduledSendAt,
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
}> {
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

  return { processed: due.length, sent, failed, skipped };
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

  const send = await sendConfirmationReminderMessage(phone, body, appointmentRef);
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
    const patch = syncPatientConfirmationForStatusChange(
      AppointmentStatus.CONFIRMADO,
      previousStatus,
      existing?.patientConfirmedAt ?? null,
      existing?.patientConfirmationSource ?? null,
      PatientConfirmationSource.WHATSAPP
    );
    await upsertFixedAppointmentOccurrence(
      fixed.seriesId,
      fixed.dateIso,
      { status: AppointmentStatus.CONFIRMADO, ...patch },
      Role.ADMIN,
      null
    );
    await cancelWhatsappRemindersForAppointment(appointmentRef);
    return true;
  }

  const appt = await appointmentRepository.findById(appointmentRef);
  if (!appt) return false;

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
