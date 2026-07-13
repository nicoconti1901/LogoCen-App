/**
 * Prueba real WhatsApp: envía el recordatorio 24 h ya (sin esperar al cron).
 *
 * Por defecto CREA un turno de prueba (no toca turnos reales).
 *
 * Uso:
 *   npm run whatsapp:real-test
 *   npm run whatsapp:real-test -- <appointmentId>          # usa el turno tal cual (sin mover fecha)
 *   npm run whatsapp:real-test -- <appointmentId> --force-reschedule   # ⚠ mueve fecha (+3 días)
 *   npm run whatsapp:cleanup-test                          # borra turnos [WhatsApp test]
 */
import "dotenv/config";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "../src/config/database.js";
import { isWhatsappConfigured, whatsappConfig } from "../src/config/whatsapp.js";
import {
  processDueWhatsappReminders,
  syncWhatsappReminderForAppointment,
} from "../src/services/whatsappReminder.service.js";
import { syncPatientConfirmationForStatusChange } from "../src/utils/appointmentConfirmation.js";
import { formatStoredDateOnlyISO } from "../src/utils/appointmentTime.js";
import { hoursUntilAppointmentStart } from "../src/whatsapp/reminderSchedule.js";
import { formatPhoneForMetaWhatsapp, normalizePhoneToE164 } from "../src/whatsapp/phone.js";
import { is24hContactTemplate } from "../src/whatsapp/messageBuilder.js";

export const TEST_MARKER = "[WhatsApp test]";

const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith("--")));
const forceReschedule = flags.has("--force-reschedule");
const resetStatus = flags.has("--reset-status");
const appointmentIdArg = rawArgs.find((a) => !a.startsWith("--"))?.trim();

type LoadedAppointment = Awaited<ReturnType<typeof createTestAppointment>>;

async function createTestAppointment() {
  const patient = await prisma.patient.findFirst({
    where: { phone: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!patient?.phone) {
    console.error("✗ No hay paciente con teléfono cargado.");
    process.exit(1);
  }

  const lastAppt = await prisma.appointment.findFirst({
    where: { patientId: patient.id },
    orderBy: { appointmentDate: "desc" },
  });
  const specialist =
    (lastAppt
      ? await prisma.specialist.findUnique({ where: { id: lastAppt.specialistId } })
      : null) ?? (await prisma.specialist.findFirst({ orderBy: { lastName: "asc" } }));

  if (!specialist) {
    console.error("✗ No hay especialistas en la base.");
    process.exit(1);
  }

  const testDay = new Date();
  testDay.setDate(testDay.getDate() + 3);
  testDay.setHours(0, 0, 0, 0);

  const startTime = "10:00";
  const endTime = "10:45";
  const consultorio = lastAppt?.consultorio ?? "Consultorio 1";

  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      specialistId: specialist.id,
      consultorio,
      appointmentDate: testDay,
      startTime,
      endTime,
      status: AppointmentStatus.RESERVED,
      reasonForVisit: `${TEST_MARKER} Prueba manual. Borrar: npm run whatsapp:cleanup-test`,
    },
    include: { patient: true, specialist: true },
  });

  console.log("✓ Turno de prueba creado (no modifica turnos existentes)\n");
  return appointment;
}

async function loadAppointment(): Promise<LoadedAppointment> {
  if (!appointmentIdArg) {
    return createTestAppointment();
  }

  let appointment = await prisma.appointment.findUnique({
    where: { id: appointmentIdArg },
    include: { patient: true, specialist: true },
  });

  if (!appointment) {
    console.error("✗ Turno no encontrado:", appointmentIdArg);
    process.exit(1);
  }

  if (!appointment.patient.phone) {
    console.error("✗ El paciente no tiene teléfono.");
    process.exit(1);
  }

  if (forceReschedule) {
    console.warn("⚠ --force-reschedule: se moverá la fecha del turno (+3 días)\n");
    const future = new Date();
    future.setDate(future.getDate() + 3);
    future.setHours(0, 0, 0, 0);
    const confirmPatch = syncPatientConfirmationForStatusChange(
      AppointmentStatus.RESERVED,
      appointment.status,
      appointment.patientConfirmedAt,
      appointment.patientConfirmationSource
    );
    appointment = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.RESERVED,
        appointmentDate: future,
        startTime: appointment.startTime || "10:00",
        endTime: appointment.endTime || "10:45",
        ...confirmPatch,
      },
      include: { patient: true, specialist: true },
    });
    return appointment;
  }

  const hours = hoursUntilAppointmentStart(appointment.appointmentDate, appointment.startTime);
  if (hours < 48) {
    console.error(
      `✗ El turno está a ${hours.toFixed(1)} h (<48 h). Usá npm run whatsapp:real-test sin id (crea turno de prueba) o --force-reschedule.`
    );
    process.exit(1);
  }

  if (appointment.status !== AppointmentStatus.RESERVED) {
    if (!resetStatus) {
      console.error(
        `✗ Estado ${appointment.status}. Solo se envía a Agendado. Repetí con --reset-status (no cambia la fecha).`
      );
      process.exit(1);
    }
    const confirmPatch = syncPatientConfirmationForStatusChange(
      AppointmentStatus.RESERVED,
      appointment.status,
      appointment.patientConfirmedAt,
      appointment.patientConfirmationSource
    );
    appointment = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.RESERVED, ...confirmPatch },
      include: { patient: true, specialist: true },
    });
    console.log("Estado reseteado a Agendado (fecha sin cambios)\n");
  }

  console.log("Usando turno existente sin mover la fecha\n");
  return appointment;
}

async function sendNow(appointment: LoadedAppointment) {
  await syncWhatsappReminderForAppointment({
    appointmentRef: appointment.id,
    patientId: appointment.patientId,
    specialistId: appointment.specialistId,
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    consultorio: appointment.consultorio,
    status: appointment.status,
  });

  const reminder = await prisma.whatsappReminder.findFirst({
    where: { appointmentRef: appointment.id },
    orderBy: { updatedAt: "desc" },
  });

  if (!reminder) {
    console.error("✗ No se creó recordatorio (¿teléfono inválido o turno <48 h?).");
    process.exit(1);
  }

  await prisma.whatsappReminder.update({
    where: { id: reminder.id },
    data: {
      status: "SCHEDULED",
      scheduledSendAt: new Date(),
      lastError: null,
      waMessageId: null,
      sentAt: null,
    },
  });

  console.log("Enviando ahora…\n");
  const result = await processDueWhatsappReminders();
  console.log(JSON.stringify(result, null, 2));

  const updated = await prisma.whatsappReminder.findUnique({ where: { id: reminder.id } });
  if (updated?.status === "SENT") {
    console.log("\n✓ Mensaje enviado. Revisá WhatsApp y tocá «Sí, confirmo».");
    console.log("  waMessageId:", updated.waMessageId);
  } else if (updated?.status === "FAILED") {
    console.error("\n✗ Error:", updated.lastError);
    process.exit(1);
  } else {
    console.warn("\n⚠ Estado final:", updated?.status, updated?.lastError ?? "");
    process.exit(1);
  }
}

async function main() {
  console.log("--- Prueba real WhatsApp ---\n");

  if (!isWhatsappConfigured()) {
    console.error("✗ WHATSAPP_ENABLED y credenciales (PHONE_NUMBER_ID, ACCESS_TOKEN) requeridos en .env");
    process.exit(1);
  }

  const template24h = whatsappConfig.reminderTemplate24hName;
  console.log("Plantilla 24h:", template24h ?? "(interactivo, sin plantilla)");
  if (template24h && is24hContactTemplate(template24h)) {
    console.log("Modo: 7 variables (orden 1,2,6,3,4,5,7)");
  }
  console.log("Centro:", whatsappConfig.clinicName);
  console.log("");

  const appointment = await loadAppointment();

  console.log("Turno:", appointment.id);
  console.log("Paciente:", appointment.patient.firstName, appointment.patient.lastName);
  const e164 = normalizePhoneToE164(appointment.patient.phone);
  console.log("Teléfono LogoCen:", appointment.patient.phone);
  console.log("Meta (to):", formatPhoneForMetaWhatsapp(e164));
  console.log(
    "Fecha turno:",
    formatStoredDateOnlyISO(appointment.appointmentDate),
    appointment.startTime
  );
  console.log("Estado:", appointment.status);
  console.log("");

  await sendNow(appointment);

  if (!appointmentIdArg || appointment.reasonForVisit?.startsWith(TEST_MARKER)) {
    console.log("\nPara borrar el turno de prueba:");
    console.log(`  npm run whatsapp:cleanup-test`);
    console.log(`  npm run whatsapp:cleanup-test -- ${appointment.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
