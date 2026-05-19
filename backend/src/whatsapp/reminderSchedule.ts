import { WhatsappReminderKind } from "@prisma/client";
import { formatStoredDateOnlyISO } from "../utils/appointmentTime.js";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export type ReminderSchedulePlan = {
  kind: WhatsappReminderKind;
  scheduledSendAt: Date;
} | null;

/** Combina fecha @db.Date y hora HH:mm en instante local del servidor (misma convención que la agenda). */
export function appointmentStartInstant(appointmentDate: Date, startTime: string): Date {
  const day = formatStoredDateOnlyISO(appointmentDate);
  const [h, m] = startTime.split(":").map(Number);
  const d = new Date(`${day}T00:00:00`);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/**
 * - ≥24 h antes del turno: recordatorio estándar a las 24 h previas.
 * - <24 h: solicitud de confirmación inmediata (con pequeño delay configurable).
 * - Turno ya iniciado o en el pasado: no programar.
 */
export function planWhatsappReminder(
  appointmentDate: Date,
  startTime: string,
  now = new Date(),
  shortNoticeDelayMinutes = 5
): ReminderSchedulePlan {
  const start = appointmentStartInstant(appointmentDate, startTime);
  const msUntilStart = start.getTime() - now.getTime();

  if (msUntilStart <= 0) return null;

  const hoursUntil = msUntilStart / MS_PER_HOUR;

  if (hoursUntil >= 24) {
    const scheduledSendAt = new Date(start.getTime() - 24 * MS_PER_HOUR);
    if (scheduledSendAt.getTime() <= now.getTime()) {
      // Ventana de 24 h ya pasó (edge): tratar como corto plazo
      return {
        kind: WhatsappReminderKind.SHORT_NOTICE,
        scheduledSendAt: new Date(now.getTime() + shortNoticeDelayMinutes * MS_PER_MINUTE),
      };
    }
    return { kind: WhatsappReminderKind.STANDARD_24H, scheduledSendAt };
  }

  return {
    kind: WhatsappReminderKind.SHORT_NOTICE,
    scheduledSendAt: new Date(now.getTime() + shortNoticeDelayMinutes * MS_PER_MINUTE),
  };
}
