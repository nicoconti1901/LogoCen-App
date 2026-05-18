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
