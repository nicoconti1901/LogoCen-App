import { AppointmentStatus } from "@prisma/client";
import { fixedAppointmentSeriesRepository } from "../repositories/fixedAppointmentSeries.repository.js";
import type {
  FixedSeriesWithOccurrencesInRange,
  FixedSeriesWithRelations,
} from "../repositories/fixedAppointmentSeries.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  formatDateOnlyISO,
  formatStoredDateOnlyISO,
  minutesToHHmm,
  timeToMinutes,
  timesOverlap,
  toDateOnly,
  weekdayFromDate,
} from "./appointmentTime.js";

function seriesEndTime(startTime: string, displayDurationMinutes: number): string {
  return minutesToHHmm(timeToMinutes(startTime) + displayDurationMinutes);
}

function isSkipped(series: FixedSeriesWithRelations, date: Date): boolean {
  const iso = formatDateOnlyISO(date);
  return series.skips.some((s) => formatStoredDateOnlyISO(s.skipDate) === iso);
}

function isActiveOnDate(series: FixedSeriesWithRelations, date: Date): boolean {
  const d = toDateOnly(date);
  if (weekdayFromDate(d) !== series.weekday) return false;
  if (d < toDateOnly(series.effectiveFrom)) return false;
  if (series.effectiveUntil && d > toDateOnly(series.effectiveUntil)) return false;
  return true;
}

function blocksSlot(series: FixedSeriesWithOccurrencesInRange, date: Date): boolean {
  if (!isActiveOnDate(series, date) || isSkipped(series, date)) return false;
  const iso = formatDateOnlyISO(date);
  const occ = series.occurrences.find((o) => formatStoredDateOnlyISO(o.occurrenceDate) === iso);
  if (occ?.status === AppointmentStatus.AUSENTE_CON_AVISO) return false;
  return true;
}

async function activeSeriesOnDate(specialistId: string, day: Date) {
  return fixedAppointmentSeriesRepository.findActiveForAgenda({
    specialistId,
    rangeFrom: day,
    rangeTo: day,
  });
}

/** El especialista tiene un turno fijo que ocupa la franja (otro paciente no puede agendarse). */
export async function assertNoFixedSeriesBlocksSpecialist(params: {
  specialistId: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  excludeSeriesId?: string;
}): Promise<void> {
  const day = toDateOnly(params.appointmentDate);
  const seriesList = await activeSeriesOnDate(params.specialistId, day);

  for (const series of seriesList) {
    if (params.excludeSeriesId && series.id === params.excludeSeriesId) continue;
    if (!blocksSlot(series, day)) continue;

    const fixedEnd = seriesEndTime(series.startTime, series.displayDurationMinutes);
    if (!timesOverlap(params.startTime, params.endTime, series.startTime, fixedEnd)) continue;

    throw new AppError(409, "El especialista ya tiene un turno fijo en ese horario");
  }
}

/** El consultorio está ocupado por un turno fijo en esa franja (cualquier especialista). */
export async function assertNoFixedSeriesBlocksConsultorio(params: {
  consultorio: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  excludeSeriesId?: string;
}): Promise<void> {
  const office = params.consultorio.trim().toLowerCase();
  if (!office) return;

  const day = toDateOnly(params.appointmentDate);
  const allOnDay = await fixedAppointmentSeriesRepository.findActiveForAgenda({
    rangeFrom: day,
    rangeTo: day,
  });
  const seriesList = allOnDay.filter((s) => s.consultorio.trim().toLowerCase() === office);

  for (const series of seriesList) {
    if (params.excludeSeriesId && series.id === params.excludeSeriesId) continue;
    if (!blocksSlot(series, day)) continue;

    const fixedEnd = seriesEndTime(series.startTime, series.displayDurationMinutes);
    if (!timesOverlap(params.startTime, params.endTime, series.startTime, fixedEnd)) continue;

    throw new AppError(409, "El consultorio ya está ocupado por un turno fijo en ese horario");
  }
}
