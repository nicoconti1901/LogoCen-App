import { AppError } from "../middleware/errorHandler.js";

/** HH:mm 24h, con ceros a la izquierda */
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function assertValidTime(t: string): string {
  const s = t.trim();
  if (!TIME_RE.test(s)) {
    throw new AppError(400, "Hora inválida; use HH:mm (24 h), ej. 09:30");
  }
  return s;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function weekdayFromDate(d: Date): "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" {
  const map = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  return map[d.getDay()];
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return as < be && ae > bs;
}

/** Normaliza una fecha a solo día (medianoche local) para @db.Date */
export function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** ISO date YYYY-MM-DD en zona local (fechas generadas con `toDateOnly` en memoria). */
export function formatDateOnlyISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO date YYYY-MM-DD para columnas `@db.Date` leídas de PostgreSQL (día calendario UTC). */
export function formatStoredDateOnlyISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateOnlyISO(s: string): Date {
  const d = new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, "Fecha inválida; use YYYY-MM-DD");
  }
  return toDateOnly(d);
}

export function currentTimeHHmm(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** El turno ya terminó (día pasado o hoy con hora de fin alcanzada). */
export function isAppointmentSlotEnded(appointmentDate: Date, endTime: string): boolean {
  const day = toDateOnly(appointmentDate);
  const today = toDateOnly(new Date());
  if (day < today) return true;
  if (day > today) return false;
  return timeToMinutes(endTime) <= timeToMinutes(currentTimeHHmm());
}

/** El día del turno ya comenzó (hoy o fecha pasada; visible desde las 00:00). */
export function isAppointmentDayStarted(appointmentDate: Date): boolean {
  const day = toDateOnly(appointmentDate);
  const today = toDateOnly(new Date());
  return day <= today;
}
