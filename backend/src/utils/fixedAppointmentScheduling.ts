import { AppointmentStatus, type Weekday } from "@prisma/client";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { fixedAppointmentSeriesRepository } from "../repositories/fixedAppointmentSeries.repository.js";
import { iterateSeriesOccurrenceDates } from "./fixedAppointmentOccurrences.js";
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

export type FixedSeriesConflictExclude = {
  excludeSeriesId?: string;
  /** Al reprogramar: ignorar otros turnos fijos del mismo paciente con este especialista. */
  excludePatientSpecialist?: { patientId: string; specialistId: string };
};

function shouldExcludeFixedSeries(
  series: { id: string; patientId: string; specialistId: string },
  exclude?: FixedSeriesConflictExclude
): boolean {
  if (!exclude) return false;
  if (exclude.excludeSeriesId && series.id === exclude.excludeSeriesId) return true;
  const ps = exclude.excludePatientSpecialist;
  if (ps && series.patientId === ps.patientId && series.specialistId === ps.specialistId) return true;
  return false;
}

/** El especialista tiene un turno fijo que ocupa la franja (otro paciente no puede agendarse). */
export async function assertNoFixedSeriesBlocksSpecialist(params: {
  specialistId: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  excludeSeriesId?: string;
  excludePatientSpecialist?: { patientId: string; specialistId: string };
}): Promise<void> {
  const exclude: FixedSeriesConflictExclude = {
    excludeSeriesId: params.excludeSeriesId,
    excludePatientSpecialist: params.excludePatientSpecialist,
  };
  const day = toDateOnly(params.appointmentDate);
  const seriesList = await activeSeriesOnDate(params.specialistId, day);

  for (const series of seriesList) {
    if (shouldExcludeFixedSeries(series, exclude)) continue;
    if (!blocksSlot(series, day)) continue;

    const fixedEnd = seriesEndTime(series.startTime, series.displayDurationMinutes);
    if (!timesOverlap(params.startTime, params.endTime, series.startTime, fixedEnd)) continue;

    throw new AppError(409, "El especialista ya tiene un turno fijo en ese horario");
  }
}

function hardEndForSeriesRange(effectiveFrom: Date, effectiveUntil: Date | null, maxWeeks: number): Date {
  if (effectiveUntil) return toDateOnly(effectiveUntil);
  const x = new Date(effectiveFrom);
  x.setDate(x.getDate() + maxWeeks * 7);
  return toDateOnly(x);
}

export type FixedSeriesOccurrenceConflictReason = "consultorio" | "specialist";

export type FixedSeriesOccurrenceConflict = {
  date: string;
  reasons: FixedSeriesOccurrenceConflictReason[];
};

type ConflictCheckParams = {
  specialistId: string;
  consultorio: string;
  weekday: Weekday;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  startTime: string;
  endTime: string;
  maxWeeks?: number;
  ignoreDates?: Set<string>;
};

async function loadConflictCheckData(params: ConflictCheckParams) {
  const maxWeeks = params.maxWeeks ?? 104;
  const from = toDateOnly(params.effectiveFrom);
  const hardEnd = hardEndForSeriesRange(from, params.effectiveUntil, maxWeeks);
  const occurrenceDates = iterateSeriesOccurrenceDates({
    weekday: params.weekday,
    effectiveFrom: from,
    effectiveUntil: params.effectiveUntil,
    maxWeeks,
  });
  const occurrenceSet = new Set(occurrenceDates.map((d) => formatDateOnlyISO(d)));

  const [specialistAppts, consultorioAppts, seriesOnSpecialist, allSeriesInRange] = await Promise.all([
    appointmentRepository.findInDateRangeBySpecialist(params.specialistId, from, hardEnd),
    appointmentRepository.findInDateRangeByConsultorio(params.consultorio, from, hardEnd),
    fixedAppointmentSeriesRepository.findActiveForAgenda({
      specialistId: params.specialistId,
      rangeFrom: from,
      rangeTo: hardEnd,
    }),
    fixedAppointmentSeriesRepository.findActiveForAgenda({
      rangeFrom: from,
      rangeTo: hardEnd,
    }),
  ]);

  const office = params.consultorio.trim().toLowerCase();
  const seriesOnConsultorio = allSeriesInRange.filter(
    (s) => s.consultorio.trim().toLowerCase() === office
  );

  return {
    occurrenceDates,
    occurrenceSet,
    specialistAppts,
    consultorioAppts,
    seriesOnSpecialist,
    seriesOnConsultorio,
    ignoreDates: params.ignoreDates,
  };
}

function collectOccurrenceConflicts(
  data: Awaited<ReturnType<typeof loadConflictCheckData>>,
  params: Pick<ConflictCheckParams, "weekday" | "startTime" | "endTime">
): FixedSeriesOccurrenceConflict[] {
  const byDate = new Map<string, Set<FixedSeriesOccurrenceConflictReason>>();

  const add = (iso: string, reason: FixedSeriesOccurrenceConflictReason) => {
    if (data.ignoreDates?.has(iso)) return;
    if (!data.occurrenceSet.has(iso)) return;
    const set = byDate.get(iso) ?? new Set<FixedSeriesOccurrenceConflictReason>();
    set.add(reason);
    byDate.set(iso, set);
  };

  for (const row of data.specialistAppts) {
    const iso = formatStoredDateOnlyISO(row.appointmentDate);
    if (weekdayFromDate(row.appointmentDate) !== params.weekday) continue;
    if (timesOverlap(params.startTime, params.endTime, row.startTime, row.endTime)) {
      add(iso, "specialist");
    }
  }

  for (const row of data.consultorioAppts) {
    const iso = formatStoredDateOnlyISO(row.appointmentDate);
    if (weekdayFromDate(row.appointmentDate) !== params.weekday) continue;
    if (timesOverlap(params.startTime, params.endTime, row.startTime, row.endTime)) {
      add(iso, "consultorio");
    }
  }

  for (const occDate of data.occurrenceDates) {
    const iso = formatDateOnlyISO(occDate);
    for (const series of data.seriesOnSpecialist) {
      if (!blocksSlot(series, occDate)) continue;
      const fixedEnd = seriesEndTime(series.startTime, series.displayDurationMinutes);
      if (!timesOverlap(params.startTime, params.endTime, series.startTime, fixedEnd)) continue;
      add(iso, "specialist");
    }

    for (const series of data.seriesOnConsultorio) {
      if (!blocksSlot(series, occDate)) continue;
      const fixedEnd = seriesEndTime(series.startTime, series.displayDurationMinutes);
      if (!timesOverlap(params.startTime, params.endTime, series.startTime, fixedEnd)) continue;
      add(iso, "consultorio");
    }
  }

  return [...byDate.entries()]
    .map(([date, reasons]) => ({
      date,
      reasons: [...reasons].sort() as FixedSeriesOccurrenceConflictReason[],
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Detecta fechas de la serie con consultorio o especialista ocupados. */
export async function findConflictsForNewFixedSeries(
  params: ConflictCheckParams
): Promise<FixedSeriesOccurrenceConflict[]> {
  const data = await loadConflictCheckData(params);
  return collectOccurrenceConflicts(data, params);
}

/** Valida conflictos de una serie fija nueva en pocas consultas (evita 100+ round-trips a Neon). */
export async function assertNoConflictsForNewFixedSeries(params: ConflictCheckParams): Promise<void> {
  const conflicts = await findConflictsForNewFixedSeries(params);
  if (conflicts.length === 0) return;

  const first = conflicts[0]!;
  if (first.reasons.includes("consultorio")) {
    throw new AppError(409, "El consultorio ya está ocupado en ese horario");
  }
  throw new AppError(409, "El especialista ya tiene una cita en ese horario");
}

/** El consultorio está ocupado por un turno fijo en esa franja (cualquier especialista). */
export async function assertNoFixedSeriesBlocksConsultorio(params: {
  consultorio: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  excludeSeriesId?: string;
  excludePatientSpecialist?: { patientId: string; specialistId: string };
}): Promise<void> {
  const exclude: FixedSeriesConflictExclude = {
    excludeSeriesId: params.excludeSeriesId,
    excludePatientSpecialist: params.excludePatientSpecialist,
  };
  const office = params.consultorio.trim().toLowerCase();
  if (!office) return;

  const day = toDateOnly(params.appointmentDate);
  const allOnDay = await fixedAppointmentSeriesRepository.findActiveForAgenda({
    rangeFrom: day,
    rangeTo: day,
  });
  const seriesList = allOnDay.filter((s) => s.consultorio.trim().toLowerCase() === office);

  for (const series of seriesList) {
    if (shouldExcludeFixedSeries(series, exclude)) continue;
    if (!blocksSlot(series, day)) continue;

    const fixedEnd = seriesEndTime(series.startTime, series.displayDurationMinutes);
    if (!timesOverlap(params.startTime, params.endTime, series.startTime, fixedEnd)) continue;

    throw new AppError(409, "El consultorio ya está ocupado por un turno fijo en ese horario");
  }
}
