import type { Appointment } from "../types";

export function getAppointmentDateStr(a: Appointment): string {
  if (a.date) return a.date;
  return a.appointmentDate.slice(0, 10);
}

export function getStartTimeStr(a: Appointment): string {
  return a.time?.start ?? a.startTime;
}

export function getEndTimeStr(a: Appointment): string {
  return a.time?.end ?? a.endTime;
}

/** ISO local para FullCalendar */
export function toCalendarStart(a: Appointment): string {
  const d = getAppointmentDateStr(a);
  return `${d}T${getStartTimeStr(a)}:00`;
}

export function toCalendarEnd(a: Appointment): string {
  const d = getAppointmentDateStr(a);
  return `${d}T${getEndTimeStr(a)}:00`;
}
