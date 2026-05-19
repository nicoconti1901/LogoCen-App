import { AppointmentStatus, PatientConfirmationSource } from "@prisma/client";
import { currentTimeHHmm, toDateOnly } from "./appointmentTime.js";

export type ConfirmationListFilter = "pending" | "confirmed";

type AppointmentTiming = {
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
};

export function isUpcomingForConfirmation(row: AppointmentTiming, now = new Date()): boolean {
  const today = toDateOnly(now);
  const day = toDateOnly(row.appointmentDate);
  if (day > today) return true;
  if (day < today) return false;
  return currentTimeHHmm() < row.endTime;
}

export function matchesConfirmationListFilter(
  row: AppointmentTiming,
  filter: ConfirmationListFilter
): boolean {
  if (!isUpcomingForConfirmation(row)) return false;
  if (filter === "pending") return row.status === AppointmentStatus.RESERVED;
  return row.status === AppointmentStatus.CONFIRMADO;
}

export function syncPatientConfirmationForStatusChange(
  nextStatus: AppointmentStatus,
  previousStatus: AppointmentStatus,
  previousConfirmedAt: Date | null,
  previousSource: PatientConfirmationSource | null,
  explicitSource?: PatientConfirmationSource | null
): { patientConfirmedAt: Date | null; patientConfirmationSource: PatientConfirmationSource | null } {
  if (nextStatus === AppointmentStatus.CONFIRMADO) {
    return {
      patientConfirmedAt: previousConfirmedAt ?? new Date(),
      patientConfirmationSource:
        explicitSource ?? previousSource ?? PatientConfirmationSource.MANUAL,
    };
  }
  if (
    previousStatus === AppointmentStatus.CONFIRMADO ||
    nextStatus === AppointmentStatus.RESERVED
  ) {
    return { patientConfirmedAt: null, patientConfirmationSource: null };
  }
  return { patientConfirmedAt: previousConfirmedAt, patientConfirmationSource: previousSource };
}
