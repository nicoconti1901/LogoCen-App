/**
 * Escenarios que pueden fallar en producción.
 */
import "dotenv/config";
import { Role } from "@prisma/client";
import { prisma } from "../src/config/database.js";
import * as fixedService from "../src/services/fixedAppointmentSeries.service.js";
import { formatDateOnlyISO, toDateOnly, weekdayFromDate } from "../src/utils/appointmentTime.js";

function todayIso() {
  return formatDateOnlyISO(toDateOnly(new Date()));
}

async function main() {
  const specialist = await prisma.specialist.findFirst({ where: { active: true } });
  const patients = await prisma.patient.findMany({ take: 2 });
  if (!specialist || patients.length < 1) throw new Error("Faltan datos seed");

  const fromDate = todayIso();
  const weekday = weekdayFromDate(new Date(`${fromDate}T12:00:00`));

  // Escenario: dos series activas mismo paciente (estado corrupto)
  const dupA = await fixedService.createFixedAppointmentSeries(
    {
      patientId: patients[0].id,
      specialistId: specialist.id,
      consultorio: "Consultorio 1",
      date: fromDate,
      startTime: "14:00",
      displayDurationMinutes: 30,
    },
    Role.ADMIN,
    null
  );

  // Forzar segunda serie activa (simula bug histórico)
  const dupB = await prisma.fixedAppointmentSeries.create({
    data: {
      patientId: patients[0].id,
      specialistId: specialist.id,
      consultorio: "Consultorio 1",
      weekday,
      startTime: "14:00",
      displayDurationMinutes: 30,
      effectiveFrom: new Date(`${fromDate}T12:00:00`),
      active: true,
    },
  });

  console.log("Dup A:", dupA.id, "Dup B:", dupB.id, "mismo paciente");

  try {
    await fixedService.rescheduleFixedAppointmentSeries(
      dupA.id,
      {
        consultorio: "Consultorio 1",
        startTime: "14:00",
        displayDurationMinutes: 30,
        fromDate,
      },
      Role.ADMIN,
      null
    );
    console.log("✅ Reschedule con duplicado activo mismo paciente: OK");
  } catch (e) {
    console.error("❌ Duplicado mismo paciente:", (e as Error).message);
  }

  // Escenario: otro paciente mismo horario (debe fallar)
  if (patients[1]) {
    const other = await fixedService.createFixedAppointmentSeries(
      {
        patientId: patients[1].id,
        specialistId: specialist.id,
        consultorio: "Consultorio 2",
        date: fromDate,
        startTime: "14:00",
        displayDurationMinutes: 30,
      },
      Role.ADMIN,
      null
    );

    const active = await prisma.fixedAppointmentSeries.findFirst({
      where: { active: true, patientId: patients[0].id },
    });
    if (active) {
      try {
        await fixedService.rescheduleFixedAppointmentSeries(
          active.id,
          {
            consultorio: "Consultorio 2",
            startTime: "14:00",
            displayDurationMinutes: 30,
            fromDate,
          },
          Role.ADMIN,
          null
        );
        console.log("❌ Debería haber fallado: otro paciente mismo horario");
      } catch (e) {
        console.log("✅ Correctamente bloqueado otro paciente:", (e as Error).message);
      }
    }
    await prisma.fixedAppointmentSeries.update({
      where: { id: other.id },
      data: { active: false },
    });
  }

  const activeDupes = await prisma.fixedAppointmentSeries.count({
    where: { active: true, patientId: patients[0].id, specialistId: specialist.id },
  });
  console.log("Series activas restantes paciente 0:", activeDupes);

  await prisma.$disconnect();
}

main();
