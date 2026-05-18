import type { Appointment } from "../types";
import { isFixedSeriesAppointment } from "./fixedAppointment";

/** Ausente con aviso libera franja del profesional y sala para nuevos turnos. */
export function appointmentBlocksScheduleSlot(a: Pick<Appointment, "status" | "id" | "isFixedSeries">): boolean {
  if (isFixedSeriesAppointment(a)) return true;
  return a.status !== "AUSENTE_CON_AVISO";
}
