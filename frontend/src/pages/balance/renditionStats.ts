import {
  appointmentDebtAmountArs,
  appointmentHasDebt,
  appointmentImputadoPagadoArs,
} from "../../lib/appointmentDebt";
import type { Appointment } from "../../types";
import { appointmentHasTransferToSpecialist } from "../../lib/paymentMethodDisplay";

export type RenditionSummary = {
  totalTurnos: number;
  attendedCount: number;
  uniquePatientsAttended: number;
  honorariosCobrados: number;
  deudasTotal: number;
  conDeuda: number;
  pendingSettlementCount: number;
};

export function isPendingSpecialistSettlement(a: Appointment): boolean {
  return (
    a.paymentCompleted &&
    appointmentHasTransferToSpecialist(a.paymentMethod, a.paymentSplits) &&
    (a.specialistSettledAt == null || a.specialistSettledAt === "")
  );
}

export function summarizeAppointments(appointments: Appointment[]): RenditionSummary {
  const attended = appointments.filter((a) => a.status === "ATTENDED");
  const uniquePatients = new Set(attended.map((a) => a.patientId)).size;
  let honorariosCobrados = 0;
  let deudasTotal = 0;
  let conDeuda = 0;
  let pendingSettlementCount = 0;

  for (const a of appointments) {
    honorariosCobrados += appointmentImputadoPagadoArs(a);
    const d = appointmentDebtAmountArs(a);
    if (d > 0) deudasTotal += d;
    if (appointmentHasDebt(a)) conDeuda += 1;
    if (isPendingSpecialistSettlement(a)) pendingSettlementCount += 1;
  }

  return {
    totalTurnos: appointments.length,
    attendedCount: attended.length,
    uniquePatientsAttended: uniquePatients,
    honorariosCobrados,
    deudasTotal,
    conDeuda,
    pendingSettlementCount,
  };
}

export function groupAppointmentsBySpecialist(
  appointments: Appointment[]
): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = map.get(a.specialistId) ?? [];
    list.push(a);
    map.set(a.specialistId, list);
  }
  return map;
}
