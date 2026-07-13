import { WhatsappReminderKind } from "@prisma/client";
import { formatStoredDateOnlyISO } from "../utils/appointmentTime.js";

const MS_PER_HOUR = 60 * 60 * 1000;

/** Anticipación mínima para programar WhatsApp (24 h antes del turno). */
export const WHATSAPP_MIN_HOURS_TO_SCHEDULE_REMINDER = 48;

/** Cuántas horas antes del inicio se envía el recordatorio. */
export const WHATSAPP_REMINDER_HOURS_BEFORE_APPOINTMENT = 24;

export type ReminderSchedulePlan = {
  kind: WhatsappReminderKind;
  scheduledSendAt: Date;
} | null;

/** Argentina (ART, UTC−3 sin DST): hora de agenda → instante UTC. Render corre en UTC. */
const CLINIC_UTC_OFFSET_HOURS = 3;

/** Combina fecha @db.Date y hora HH:mm (hora del centro) en instante UTC. */
export function appointmentStartInstant(appointmentDate: Date, startTime: string): Date {
  const day = formatStoredDateOnlyISO(appointmentDate);
  const [y, mo, da] = day.split("-").map(Number);
  const [h, m] = startTime.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, da, (h ?? 0) + CLINIC_UTC_OFFSET_HOURS, m ?? 0, 0, 0));
}

export function hoursUntilAppointmentStart(
  appointmentDate: Date,
  startTime: string,
  now = new Date()
): number {
  const start = appointmentStartInstant(appointmentDate, startTime);
  const msUntilStart = start.getTime() - now.getTime();
  if (msUntilStart <= 0) return 0;
  return msUntilStart / MS_PER_HOUR;
}

/** Turno futuro con menos de 48 h: sin WhatsApp; se confirma automáticamente al agendar/editar. */
export function shouldAutoConfirmWithoutWhatsapp(
  appointmentDate: Date,
  startTime: string,
  now = new Date()
): boolean {
  const hours = hoursUntilAppointmentStart(appointmentDate, startTime, now);
  return hours > 0 && hours < WHATSAPP_MIN_HOURS_TO_SCHEDULE_REMINDER;
}

/**
 * Solo recordatorio 24 h antes del turno.
 * - ≥48 h de anticipación: STANDARD_24H programado para (inicio − 24 h).
 * - &lt;48 h: no programar (usar auto-confirmación en sync).
 * - Turno ya iniciado o en el pasado: no programar.
 */
export function planWhatsappReminder(
  appointmentDate: Date,
  startTime: string,
  now = new Date()
): ReminderSchedulePlan {
  const start = appointmentStartInstant(appointmentDate, startTime);
  const msUntilStart = start.getTime() - now.getTime();

  if (msUntilStart <= 0) return null;

  const hoursUntil = msUntilStart / MS_PER_HOUR;
  if (hoursUntil < WHATSAPP_MIN_HOURS_TO_SCHEDULE_REMINDER) return null;

  const scheduledSendAt = new Date(
    start.getTime() - WHATSAPP_REMINDER_HOURS_BEFORE_APPOINTMENT * MS_PER_HOUR
  );
  if (scheduledSendAt.getTime() <= now.getTime()) return null;

  return { kind: WhatsappReminderKind.STANDARD_24H, scheduledSendAt };
}
