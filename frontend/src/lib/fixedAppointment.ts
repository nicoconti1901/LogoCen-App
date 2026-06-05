import type { Appointment } from "../types";
import { getAppointmentDateStr } from "./appointmentDisplay";

const PREFIX = "fixed:";

export function isFixedSeriesAppointment(a: Pick<Appointment, "id" | "isFixedSeries">): boolean {
  return Boolean(a.isFixedSeries) || a.id.startsWith(PREFIX);
}

export function parseFixedAppointmentId(id: string): { seriesId: string; dateIso: string } | null {
  if (!id.startsWith(PREFIX)) return null;
  const rest = id.slice(PREFIX.length);
  const colon = rest.lastIndexOf(":");
  if (colon <= 0) return null;
  return { seriesId: rest.slice(0, colon), dateIso: rest.slice(colon + 1) };
}

export function getFixedSeriesId(a: Appointment): string | null {
  if (a.fixedSeriesId) return a.fixedSeriesId;
  return parseFixedAppointmentId(a.id)?.seriesId ?? null;
}

/** Ignora la serie fija que se está editando al calcular ocupación de consultorio. */
export function isOwnFixedSeriesConsultorioSlot(
  slot: { id: string; fixedSeriesId?: string | null },
  seriesId: string | null | undefined
): boolean {
  if (!seriesId) return false;
  if (slot.fixedSeriesId) return slot.fixedSeriesId === seriesId;
  return slot.id.startsWith(`${PREFIX}${seriesId}:`);
}

export function getFixedOccurrenceDate(a: Appointment): string {
  return parseFixedAppointmentId(a.id)?.dateIso ?? getAppointmentDateStr(a);
}

export const WEEKDAY_LABEL_ES: Record<string, string> = {
  MONDAY: "lunes",
  TUESDAY: "martes",
  WEDNESDAY: "miércoles",
  THURSDAY: "jueves",
  FRIDAY: "viernes",
  SATURDAY: "sábado",
  SUNDAY: "domingo",
};

export function weekdayLabelFromDate(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  const keys = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  return WEEKDAY_LABEL_ES[keys[d.getDay()]] ?? "";
}

const WEEKDAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/** Próxima fecha (hoy o posterior) que coincide con el día de la semana de la serie. */
export function nextDateForSeriesWeekday(weekday: string, minDateIso?: string): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const startIso = minDateIso && minDateIso > todayIso ? minDateIso : todayIso;
  const target = WEEKDAY_INDEX[weekday] ?? 1;
  const d = new Date(`${startIso}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === target) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    d.setDate(d.getDate() + 1);
  }
  return startIso;
}
