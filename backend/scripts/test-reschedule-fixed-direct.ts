/**
 * Prueba directa del servicio: crear turno fijo y reprogramarlo al mismo horario.
 * Uso: npx tsx scripts/test-reschedule-fixed-direct.ts
 */
import "dotenv/config";
import { Role } from "@prisma/client";
import { prisma } from "../src/config/database.js";
import * as fixedService from "../src/services/fixedAppointmentSeries.service.js";
import { formatDateOnlyISO, toDateOnly, weekdayFromDate } from "../src/utils/appointmentTime.js";

function todayIso(): string {
  return formatDateOnlyISO(toDateOnly(new Date()));
}

function nextDateForWeekday(weekday: string, minIso: string): string {
  const idx: Record<string, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  };
  const target = idx[weekday] ?? 1;
  const d = new Date(`${minIso}T12:00:00`);
  for (let i = 0; i < 14; i++) {
    if (d.getDay() === target) {
      const iso = formatDateOnlyISO(toDateOnly(d));
      if (iso >= minIso) return iso;
    }
    d.setDate(d.getDate() + 1);
  }
  return minIso;
}

async function ensureActiveSeries() {
  const existing = await prisma.fixedAppointmentSeries.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const specialist = await prisma.specialist.findFirst({ where: { active: true } });
  const patient = await prisma.patient.findFirst();
  if (!specialist || !patient) {
    throw new Error("Faltan especialista o paciente en la base. Corré npm run db:seed.");
  }

  const fromDate = todayIso();
  const weekday = weekdayFromDate(new Date(`${fromDate}T12:00:00`));
  const consultorio = specialist.consultorios?.[0] ?? "Consultorio 1";

  console.log("Creando serie fija de prueba…");
  const created = await fixedService.createFixedAppointmentSeries(
    {
      patientId: patient.id,
      specialistId: specialist.id,
      consultorio,
      date: fromDate,
      startTime: "10:00",
      displayDurationMinutes: 30,
      effectiveUntil: null,
    },
    Role.ADMIN,
    null
  );

  return prisma.fixedAppointmentSeries.findUniqueOrThrow({ where: { id: created.id } });
}

async function main() {
  const series = await ensureActiveSeries();

  const fromDate = nextDateForWeekday(series.weekday, todayIso());
  console.log("Serie activa:", series.id);
  console.log("Paciente:", series.patientId, "Especialista:", series.specialistId);
  console.log("Horario:", series.weekday, series.startTime, series.consultorio);
  console.log("fromDate:", fromDate);

  try {
    const created = await fixedService.rescheduleFixedAppointmentSeries(
      series.id,
      {
        consultorio: series.consultorio,
        startTime: series.startTime,
        displayDurationMinutes: series.displayDurationMinutes,
        effectiveUntil: series.effectiveUntil ? formatDateOnlyISO(toDateOnly(series.effectiveUntil)) : null,
        fromDate,
      },
      Role.ADMIN,
      null
    );
    console.log("\n✅ Reschedule mismo horario OK → nueva serie:", created.id);

    // Segundo intento: cambiar solo consultorio si hay otro disponible
    const altConsultorio =
      series.consultorio.toLowerCase().includes("1") ? "Consultorio 2" : "Consultorio 1";
    const created2 = await fixedService.rescheduleFixedAppointmentSeries(
      created.id,
      {
        consultorio: altConsultorio,
        startTime: series.startTime,
        displayDurationMinutes: series.displayDurationMinutes,
        effectiveUntil: null,
        fromDate,
      },
      Role.ADMIN,
      null
    );
    console.log("✅ Reschedule cambio consultorio OK →", created2.id, altConsultorio);

    // Tercer intento: cambiar hora +15 min
    const created3 = await fixedService.rescheduleFixedAppointmentSeries(
      created2.id,
      {
        consultorio: altConsultorio,
        startTime: "10:15",
        displayDurationMinutes: 30,
        effectiveUntil: null,
        fromDate,
      },
      Role.ADMIN,
      null
    );
    console.log("✅ Reschedule cambio hora OK →", created3.id, "10:15");
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : e;
    console.error("\n❌ FALLO:", msg);

    const others = await prisma.fixedAppointmentSeries.findMany({
      where: { active: true, specialistId: series.specialistId },
      select: {
        id: true,
        patientId: true,
        weekday: true,
        startTime: true,
        displayDurationMinutes: true,
        consultorio: true,
      },
    });
    console.log("\nSeries activas del especialista:", others.length);
    for (const o of others) {
      console.log(" -", o.id.slice(0, 8), o.weekday, o.startTime, "pac", o.patientId.slice(0, 8), o.consultorio);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
