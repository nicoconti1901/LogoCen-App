import type { Appointment } from "../types";

/** Ausente con aviso libera franja del profesional y sala para nuevos turnos. */
export function appointmentBlocksScheduleSlot(a: Pick<Appointment, "status">): boolean {
  return a.status !== "AUSENTE_CON_AVISO";
}
