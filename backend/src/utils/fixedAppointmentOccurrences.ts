import { AppointmentStatus, type Weekday } from "@prisma/client";
import type { AppointmentWithRelations } from "../repositories/appointment.repository.js";
import type {
  FixedSeriesWithOccurrencesInRange,
  FixedSeriesWithRelations,
} from "../repositories/fixedAppointmentSeries.repository.js";
import type { FixedOccurrenceRow } from "../repositories/fixedAppointmentOccurrence.repository.js";
import {
  formatDateOnlyISO,
  formatStoredDateOnlyISO,
  isAppointmentDayStarted,
  minutesToHHmm,
  timeToMinutes,
  timesOverlap,
  toDateOnly,
  weekdayFromDate,
} from "./appointmentTime.js";

export const FIXED_APPOINTMENT_ID_PREFIX = "fixed:";

export function buildFixedAppointmentId(seriesId: string, dateIso: string): string {
  return `${FIXED_APPOINTMENT_ID_PREFIX}${seriesId}:${dateIso}`;
}

export function parseFixedAppointmentId(id: string): { seriesId: string; dateIso: string } | null {
  if (!id.startsWith(FIXED_APPOINTMENT_ID_PREFIX)) return null;
  const rest = id.slice(FIXED_APPOINTMENT_ID_PREFIX.length);
  const colon = rest.lastIndexOf(":");
  if (colon <= 0) return null;
  const seriesId = rest.slice(0, colon);
  const dateIso = rest.slice(colon + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  return { seriesId, dateIso };
}

function seriesEndTime(startTime: string, displayDurationMinutes: number): string {
  return minutesToHHmm(timeToMinutes(startTime) + displayDurationMinutes);
}

function isSkipped(series: FixedSeriesWithRelations, date: Date): boolean {
  const iso = formatDateOnlyISO(date);
  return series.skips.some((s) => formatStoredDateOnlyISO(s.skipDate) === iso);
}

function appointmentBlocksSlot(a: Pick<AppointmentWithRelations, "status">): boolean {
  return a.status !== AppointmentStatus.AUSENTE_CON_AVISO;
}

function occurrenceMapForSeries(
  series: FixedSeriesWithOccurrencesInRange | FixedSeriesWithRelations
): Map<string, FixedOccurrenceRow> {
  const m = new Map<string, FixedOccurrenceRow>();
  const list = "occurrences" in series ? (series.occurrences ?? []) : [];
  for (const o of list) {
    m.set(formatStoredDateOnlyISO(o.occurrenceDate), o);
  }
  return m;
}

function resolveVirtualStatus(
  occurrence: FixedOccurrenceRow | undefined,
  occurrenceDate: Date
): AppointmentStatus {
  if (occurrence) return occurrence.status;
  const today = toDateOnly(new Date());
  if (occurrenceDate < today) return AppointmentStatus.ATTENDED;
  return AppointmentStatus.RESERVED;
}

function hasRealOverlapOnDate(
  date: Date,
  startTime: string,
  endTime: string,
  specialistId: string,
  consultorio: string,
  realAppointments: AppointmentWithRelations[]
): boolean {
  const iso = formatDateOnlyISO(date);
  for (const a of realAppointments) {
    if (formatStoredDateOnlyISO(a.appointmentDate) !== iso) continue;
    if (!appointmentBlocksSlot(a)) continue;
    if (a.specialistId === specialistId && timesOverlap(startTime, endTime, a.startTime, a.endTime)) {
      return true;
    }
    if (
      consultorio.trim() &&
      a.consultorio.trim().toLowerCase() === consultorio.trim().toLowerCase() &&
      timesOverlap(startTime, endTime, a.startTime, a.endTime)
    ) {
      return true;
    }
  }
  return false;
}

/** Genera ocurrencias virtuales en el rango visible (sin persistir Appointment). */
export function expandFixedSeriesToVirtualAppointments(params: {
  seriesList: FixedSeriesWithOccurrencesInRange[];
  rangeFrom: Date;
  rangeTo: Date;
  realAppointments: AppointmentWithRelations[];
  /** Historial de pagos: turnos fijos del día actual (desde 00:00) y pasados; no futuros. */
  forPaymentSummary?: boolean;
}): AppointmentWithRelations[] {
  const { seriesList, realAppointments } = params;
  const from = toDateOnly(params.rangeFrom);
  const to = toDateOnly(params.rangeTo);
  const out: AppointmentWithRelations[] = [];

  for (const series of seriesList) {
    if (!series.active) continue;
    const effFrom = toDateOnly(series.effectiveFrom);
    const effUntil = series.effectiveUntil ? toDateOnly(series.effectiveUntil) : null;
    const endTime = seriesEndTime(series.startTime, series.displayDurationMinutes);
    const occByDate = occurrenceMapForSeries(series);

    let d = new Date(Math.max(from.getTime(), effFrom.getTime()));
    d = toDateOnly(d);
    const last = toDateOnly(to);

    let guard = 0;
    const maxDays = 800;
    while (d <= last && guard < maxDays) {
      guard += 1;
      if (d < effFrom) {
        d.setDate(d.getDate() + 1);
        continue;
      }
      if (effUntil && d > effUntil) break;
      if (weekdayFromDate(d) === series.weekday) {
        if (!isSkipped(series, d)) {
          const dateIso = formatDateOnlyISO(d);
          if (
            !hasRealOverlapOnDate(
              d,
              series.startTime,
              endTime,
              series.specialistId,
              series.consultorio,
              realAppointments
            )
          ) {
            const virtualId = buildFixedAppointmentId(series.id, dateIso);
            const occ = occByDate.get(dateIso);

            if (params.forPaymentSummary && !isAppointmentDayStarted(d)) continue;

            const status = resolveVirtualStatus(occ, d);
            out.push({
              id: virtualId,
              patientId: series.patientId,
              specialistId: series.specialistId,
              consultorio: series.consultorio,
              appointmentDate: new Date(d),
              startTime: series.startTime,
              endTime,
              status,
              reservationDepositAmount: occ?.reservationDepositAmount ?? null,
              medicalRecord: occ?.medicalRecord ?? null,
              reasonForVisit: occ?.reasonForVisit ?? series.reasonForVisit,
              paymentMethod: occ?.paymentMethod ?? null,
              paymentSplits: occ?.paymentSplits ?? null,
              paymentCompleted: occ?.paymentCompleted ?? false,
              paymentDate: occ?.paymentDate ?? null,
              specialistSettledAt: occ?.specialistSettledAt ?? null,
              patientConfirmedAt: occ?.patientConfirmedAt ?? null,
              patientConfirmationSource: occ?.patientConfirmationSource ?? null,
              createdAt: occ?.createdAt ?? series.createdAt,
              updatedAt: occ?.updatedAt ?? series.updatedAt,
              patient: series.patient,
              specialist: series.specialist,
              payments: [],
            } as AppointmentWithRelations);
          }
        }
      }
      d.setDate(d.getDate() + 1);
    }
  }

  return out;
}

/** Una ocurrencia virtual (p. ej. para editar pago o devolver por id). */
export function buildVirtualAppointmentForDate(
  series: FixedSeriesWithOccurrencesInRange | FixedSeriesWithRelations,
  occurrenceDate: Date,
  occ?: FixedOccurrenceRow | null
): AppointmentWithRelations {
  const dateIso = formatDateOnlyISO(occurrenceDate);
  const endTime = seriesEndTime(series.startTime, series.displayDurationMinutes);
  const occList = "occurrences" in series ? series.occurrences : undefined;
  const row =
    occ ?? occList?.find((o: FixedOccurrenceRow) => formatStoredDateOnlyISO(o.occurrenceDate) === dateIso);
  const status = resolveVirtualStatus(row ?? undefined, occurrenceDate);
  return {
    id: buildFixedAppointmentId(series.id, dateIso),
    patientId: series.patientId,
    specialistId: series.specialistId,
    consultorio: series.consultorio,
    appointmentDate: toDateOnly(occurrenceDate),
    startTime: series.startTime,
    endTime,
    status,
    reservationDepositAmount: row?.reservationDepositAmount ?? null,
    medicalRecord: row?.medicalRecord ?? null,
    reasonForVisit: row?.reasonForVisit ?? series.reasonForVisit,
    paymentMethod: row?.paymentMethod ?? null,
    paymentSplits: row?.paymentSplits ?? null,
    paymentCompleted: row?.paymentCompleted ?? false,
    paymentDate: row?.paymentDate ?? null,
    specialistSettledAt: row?.specialistSettledAt ?? null,
    patientConfirmedAt: row?.patientConfirmedAt ?? null,
    patientConfirmationSource: row?.patientConfirmationSource ?? null,
    createdAt: row?.createdAt ?? series.createdAt,
    updatedAt: row?.updatedAt ?? series.updatedAt,
    patient: series.patient,
    specialist: series.specialist,
    payments: [],
  } as AppointmentWithRelations;
}

/** Fechas de ocurrencia para validar conflictos al crear una serie (máx. ~2 años). */
export function iterateSeriesOccurrenceDates(params: {
  weekday: Weekday;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  maxWeeks?: number;
}): Date[] {
  const maxWeeks = params.maxWeeks ?? 104;
  const from = toDateOnly(params.effectiveFrom);
  const hardEnd = params.effectiveUntil
    ? toDateOnly(params.effectiveUntil)
    : (() => {
        const x = new Date(from);
        x.setDate(x.getDate() + maxWeeks * 7);
        return x;
      })();

  const out: Date[] = [];
  let d = new Date(from);
  d = toDateOnly(d);
  let count = 0;
  while (d <= hardEnd && count < maxWeeks) {
    if (weekdayFromDate(d) === params.weekday) {
      out.push(new Date(d));
      count += 1;
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}
