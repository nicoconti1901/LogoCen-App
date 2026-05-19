import type { Appointment } from "../types";
import { getAppointmentDateStr } from "./appointmentDisplay";

/** Turnos agendados (RESERVED) que aún no pasaron (hoy incluido si no terminó la franja). */
export function appointmentIsUpcomingForConfirmation(a: Appointment, now = new Date()): boolean {
  if (a.status !== "RESERVED") return false;
  const dateStr = getAppointmentDateStr(a);
  const todayStr = localDateIso(now);
  if (dateStr > todayStr) return true;
  if (dateStr < todayStr) return false;
  const [eh, em] = a.endTime.split(":").map(Number);
  const endMinutes = (eh ?? 0) * 60 + (em ?? 0);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes < endMinutes;
}

export function isPatientConfirmed(a: Appointment): boolean {
  return a.status === "CONFIRMADO";
}

export function appointmentNeedsConfirmation(a: Appointment, now = new Date()): boolean {
  return appointmentIsUpcomingForConfirmation(a, now);
}

export function patientConfirmationSourceLabel(
  source: Appointment["patientConfirmationSource"]
): string | null {
  if (!source) return null;
  if (source === "WHATSAPP") return "WhatsApp";
  if (source === "MANUAL") return "Manual (admin)";
  return source;
}

function localDateIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatPatientConfirmedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
