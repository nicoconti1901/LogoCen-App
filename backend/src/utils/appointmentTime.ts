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

/** ISO date YYYY-MM-DD */
export function formatDateOnlyISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
