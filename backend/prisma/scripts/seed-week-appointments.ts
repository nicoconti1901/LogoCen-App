/**
 * Carga de prueba: N turnos en una semana usando especialistas y franjas ya configuradas.
 *
 * Uso (desde backend/):
 *   npm run db:seed-appointments
 *   npm run db:seed-appointments -- --count=80 --week=2026-05-19
 *   npm run db:seed-appointments -- --dry-run
 *
 * Variables de entorno (opcionales):
 *   LOAD_TEST_COUNT=80
 *   LOAD_TEST_WEEK_START=2026-05-19   (lunes de la semana; si no, semana actual)
 *   LOAD_TEST_SLOT_MINUTES=60
 *   DRY_RUN=1
 *
 * Requisitos en la BD:
 *   - Al menos 1 especialista activo con availabilities (franjas horarias).
 *   - Pacientes: usa los existentes; si hay menos de 5, crea pacientes de prueba.
 *
 * Los turnos se marcan con reasonForVisit = "[CARGA-PRUEBA]" para poder borrarlos:
 *   npm run db:seed-appointments:cleanup
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../../.env") });

import {
  AppointmentPaymentMethod,
  AppointmentStatus,
  Prisma,
  PrismaClient,
  type Weekday,
} from "@prisma/client";

const MARKER = "[CARGA-PRUEBA]";
const CONSULTORIOS = ["Consultorio 1", "Consultorio 2", "Consultorio 3"];

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let count = Number(process.env.LOAD_TEST_COUNT ?? 80);
  let weekStart = process.env.LOAD_TEST_WEEK_START ?? "";
  let slotMinutes = Number(process.env.LOAD_TEST_SLOT_MINUTES ?? 60);
  let dryRun = process.env.DRY_RUN === "1";
  let createPatients = false;

  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--create-patients") createPatients = true;
    else if (a.startsWith("--count=")) count = Number(a.slice(8));
    else if (a.startsWith("--week=")) weekStart = a.slice(7);
    else if (a.startsWith("--slot=")) slotMinutes = Number(a.slice(7));
  }

  if (!Number.isFinite(count) || count < 1) count = 80;
  if (!Number.isFinite(slotMinutes) || slotMinutes < 15) slotMinutes = 60;

  return { count, weekStart, slotMinutes, dryRun, createPatients };
}

function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnlyISO(s: string): Date {
  const d = new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${s}`);
  return toDateOnly(d);
}

function formatDateOnlyISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatStoredDateOnlyISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return as < be && ae > bs;
}

function weekdayFromDate(d: Date): Weekday {
  const map = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  return map[d.getDay()];
}

function mondayOfWeekContaining(ref: Date): Date {
  const d = toDateOnly(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function weekDaysFromMonday(monday: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(toDateOnly(d));
  }
  return days;
}

type Slot = {
  specialistId: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
};

type Placed = Slot & { consultorio: string; patientId: string; status: AppointmentStatus };

function slotFitsAvailability(
  availabilities: { weekday: Weekday; startTime: string; endTime: string }[],
  day: Date,
  startTime: string,
  endTime: string
): boolean {
  const weekday = weekdayFromDate(day);
  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  return availabilities.some((a) => {
    if (a.weekday !== weekday) return false;
    return startM >= timeToMinutes(a.startTime) && endM <= timeToMinutes(a.endTime);
  });
}

function conflictsWithAppointments(
  placed: Placed[],
  existing: { specialistId: string; consultorio: string; appointmentDate: Date; startTime: string; endTime: string; status: AppointmentStatus }[],
  slot: Slot,
  consultorio: string
): boolean {
  const iso = formatDateOnlyISO(slot.appointmentDate);
  const all = [
    ...placed,
    ...existing.map((e) => ({
      specialistId: e.specialistId,
      consultorio: e.consultorio,
      appointmentDate: e.appointmentDate,
      startTime: e.startTime,
      endTime: e.endTime,
      status: e.status,
    })),
  ];

  for (const row of all) {
    if (formatDateOnlyISO(row.appointmentDate) !== iso) continue;
    if (row.status === AppointmentStatus.AUSENTE_CON_AVISO) continue;

    if (
      row.specialistId === slot.specialistId &&
      timesOverlap(slot.startTime, slot.endTime, row.startTime, row.endTime)
    ) {
      return true;
    }
    if (
      consultorio &&
      row.consultorio.trim().toLowerCase() === consultorio.trim().toLowerCase() &&
      timesOverlap(slot.startTime, slot.endTime, row.startTime, row.endTime)
    ) {
      return true;
    }
  }
  return false;
}

function conflictsWithFixedSeries(
  seriesList: Awaited<ReturnType<typeof loadFixedSeriesInRange>>,
  slot: Slot,
  consultorio: string
): boolean {
  const iso = formatDateOnlyISO(slot.appointmentDate);
  const day = slot.appointmentDate;

  for (const series of seriesList) {
    const sameSpecialist = series.specialistId === slot.specialistId;
    const sameOffice = series.consultorio.trim().toLowerCase() === consultorio.toLowerCase();
    if (!sameSpecialist && !sameOffice) continue;

    if (weekdayFromDate(day) !== series.weekday) continue;
    if (day < toDateOnly(series.effectiveFrom)) continue;
    if (series.effectiveUntil && day > toDateOnly(series.effectiveUntil)) continue;
    if (series.skips.some((s) => formatStoredDateOnlyISO(s.skipDate) === iso)) continue;

    const occ = series.occurrences.find((o) => formatStoredDateOnlyISO(o.occurrenceDate) === iso);
    if (occ?.status === AppointmentStatus.AUSENTE_CON_AVISO) continue;

    const fixedEnd = minutesToHHmm(timeToMinutes(series.startTime) + series.displayDurationMinutes);
    if (timesOverlap(slot.startTime, slot.endTime, series.startTime, fixedEnd)) {
      return true;
    }
  }
  return false;
}

async function loadFixedSeriesInRange(from: Date, to: Date) {
  return prisma.fixedAppointmentSeries.findMany({
    where: {
      active: true,
      effectiveFrom: { lte: to },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: from } }],
    },
    include: {
      skips: true,
      occurrences: {
        where: { occurrenceDate: { gte: from, lte: to } },
      },
    },
  });
}

function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return "(no definida — copiá backend/.env)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return "(DATABASE_URL inválida)";
  }
}

async function ensurePatients(min: number, createPatients: boolean): Promise<{ id: string }[]> {
  const patients = await prisma.patient.findMany({ select: { id: true }, take: 500 });
  if (patients.length >= min) return patients;

  if (!createPatients) {
    console.error(
      `Hay ${patients.length} paciente(s) en la BD; se necesitan al menos ${min} para repartir turnos.`,
      "Agregá pacientes en la app o ejecutá con --create-patients."
    );
    process.exit(1);
  }

  const need = min - patients.length;
  console.log(`Creando ${need} paciente(s) de prueba…`);
  for (let i = 0; i < need; i++) {
    const n = patients.length + i + 1;
    const p = await prisma.patient.create({
      data: {
        firstName: `Carga`,
        lastName: `Prueba ${n}`,
        email: `carga.prueba.${n}.${Date.now()}@loadtest.local`,
        phone: `11${String(40000000 + n).slice(-8)}`,
      },
      select: { id: true },
    });
    patients.push(p);
  }
  return patients;
}

function pickStatus(index: number, date: Date, today: Date): AppointmentStatus {
  if (date < today) {
    const past = [AppointmentStatus.ATTENDED, AppointmentStatus.ATTENDED, AppointmentStatus.AUSENTE_SIN_AVISO];
    return past[index % past.length];
  }
  if (date.getTime() === today.getTime()) {
    return index % 3 === 0 ? AppointmentStatus.RESERVADO : AppointmentStatus.RESERVED;
  }
  return index % 4 === 0 ? AppointmentStatus.RESERVADO : AppointmentStatus.RESERVED;
}

async function main() {
  const { count, weekStart, slotMinutes, dryRun, createPatients } = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL. Ejecutá desde backend/ o definí backend/.env");
    process.exit(1);
  }

  const monday = weekStart ? parseDateOnlyISO(weekStart) : mondayOfWeekContaining(new Date());
  const weekDays = weekDaysFromMonday(monday);
  const rangeTo = weekDays[6];
  const today = toDateOnly(new Date());

  console.log("--- Carga de turnos de prueba ---");
  console.log(`Base de datos: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
  console.log(`Objetivo: ${count} turnos`);
  console.log(`Semana: ${formatDateOnlyISO(weekDays[0])} → ${formatDateOnlyISO(weekDays[6])}`);
  console.log(`Duración por turno: ${slotMinutes} min`);
  if (dryRun) console.log("Modo: DRY RUN (no escribe en BD)");

  const specialists = await prisma.specialist.findMany({
    where: { active: true },
    include: { availabilities: true },
  });

  if (specialists.length === 0) {
    console.error("No hay especialistas activos. Creá especialistas con franjas horarias primero.");
    process.exit(1);
  }

  const withoutAvail = specialists.filter((s) => s.availabilities.length === 0);
  if (withoutAvail.length > 0) {
    console.warn(
      "Especialistas sin franjas (se omiten):",
      withoutAvail.map((s) => `${s.lastName}, ${s.firstName}`).join("; ")
    );
  }

  const usable = specialists.filter((s) => s.availabilities.length > 0);
  if (usable.length === 0) {
    console.error("Ningún especialista activo tiene disponibilidad horaria configurada.");
    process.exit(1);
  }

  console.log(
    "Especialistas:",
    usable.map((s) => `${s.lastName}, ${s.firstName} (${s.availabilities.length} franja(s))`).join(" | ")
  );

  const patients = await ensurePatients(5, createPatients);
  const existing = await prisma.appointment.findMany({
    where: {
      appointmentDate: { gte: weekDays[0], lte: rangeTo },
    },
    select: {
      specialistId: true,
      consultorio: true,
      appointmentDate: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  const fixedSeries = await loadFixedSeriesInRange(weekDays[0], rangeTo);

  const candidateSlots: Slot[] = [];
  for (const spec of usable) {
    for (const day of weekDays) {
      const weekday = weekdayFromDate(day);
      for (const av of spec.availabilities) {
        if (av.weekday !== weekday) continue;
        let cursor = timeToMinutes(av.startTime);
        const endAvail = timeToMinutes(av.endTime);
        while (cursor + slotMinutes <= endAvail) {
          const startTime = minutesToHHmm(cursor);
          const endTime = minutesToHHmm(cursor + slotMinutes);
          if (slotFitsAvailability(spec.availabilities, day, startTime, endTime)) {
            candidateSlots.push({
              specialistId: spec.id,
              appointmentDate: day,
              startTime,
              endTime,
            });
          }
          cursor += slotMinutes;
        }
      }
    }
  }

  console.log(`Franjas candidatas (antes de conflictos): ${candidateSlots.length}`);

  // Mezclar para repartir entre especialistas y días
  for (let i = candidateSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidateSlots[i], candidateSlots[j]] = [candidateSlots[j], candidateSlots[i]];
  }

  const placed: Placed[] = [];
  let patientIdx = 0;
  let consultorioIdx = 0;

  const paymentMethods: AppointmentPaymentMethod[] = [
    AppointmentPaymentMethod.CASH_TO_LOGOCEN,
    AppointmentPaymentMethod.TRANSFER_TO_LOGOCEN,
    AppointmentPaymentMethod.TRANSFER_TO_SPECIALIST,
  ];

  for (const slot of candidateSlots) {
    if (placed.length >= count) break;

    let assigned = false;
    for (let attempt = 0; attempt < CONSULTORIOS.length; attempt++) {
      const consultorio = CONSULTORIOS[(consultorioIdx + attempt) % CONSULTORIOS.length];
      if (conflictsWithAppointments(placed, existing, slot, consultorio)) continue;
      if (conflictsWithFixedSeries(fixedSeries, slot, consultorio)) continue;

      const patient = patients[patientIdx % patients.length];
      patientIdx += 1;
      consultorioIdx += 1;

      const status = pickStatus(placed.length, slot.appointmentDate, today);
      const paymentCompleted =
        status === AppointmentStatus.ATTENDED && placed.length % 2 === 0;

      placed.push({
        ...slot,
        consultorio,
        patientId: patient.id,
        status,
      });

      if (!dryRun) {
        const spec = usable.find((s) => s.id === slot.specialistId)!;
        const fee = spec.consultationFee;
        let reservationDepositAmount: Prisma.Decimal | null = null;
        if (status === AppointmentStatus.RESERVADO && fee != null) {
          const half = Number(fee) * 0.5;
          reservationDepositAmount = new Prisma.Decimal(Math.round(half * 100) / 100);
        }

        await prisma.appointment.create({
          data: {
            patientId: patient.id,
            specialistId: slot.specialistId,
            consultorio,
            appointmentDate: slot.appointmentDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status,
            reasonForVisit: MARKER,
            paymentMethod: paymentMethods[placed.length % paymentMethods.length],
            paymentCompleted,
            paymentDate: paymentCompleted ? slot.appointmentDate : null,
            reservationDepositAmount,
          },
        });
      }

      assigned = true;
      break;
    }

    if (!assigned) continue;
  }

  console.log(`Turnos ${dryRun ? "simulados" : "creados"}: ${placed.length} / ${count}`);

  if (!dryRun) {
    const inDb = await prisma.appointment.count({ where: { reasonForVisit: MARKER } });
    console.log(`Verificación en BD (marcador ${MARKER}): ${inDb} turno(s) en total`);
  }

  if (placed.length === 0) {
    console.error("No se creó ningún turno. Revisá franjas horarias y conflictos con turnos existentes.");
    process.exit(1);
  }

  if (placed.length < count) {
    console.warn(
      `No alcanzó a generar ${count}. Agregá más franjas horarias, más especialistas o bajá LOAD_TEST_COUNT.`
    );
  }

  if (placed.length > 0) {
    const bySpec = new Map<string, number>();
    for (const p of placed) {
      bySpec.set(p.specialistId, (bySpec.get(p.specialistId) ?? 0) + 1);
    }
    console.log("Por especialista:");
    for (const s of usable) {
      console.log(`  ${s.lastName}, ${s.firstName}: ${bySpec.get(s.id) ?? 0}`);
    }
    console.log(`Marcador en BD: reasonForVisit = "${MARKER}"`);
    console.log("Para borrar: npm run db:seed-appointments:cleanup");
    console.log("");
    console.log("En la agenda:");
    console.log(`  - Semana ${formatDateOnlyISO(weekDays[0])} → ${formatDateOnlyISO(weekDays[6])}`);
    console.log("  - Vista recomendada: Semana (lista) o Día; en Meso solo se ven 2 turnos/día (+N turnos).");
    console.log("  - Recargá la página (F5) después de ejecutar el script.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
