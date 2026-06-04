/**
 * Prueba real: deja un turno en RESERVED (futuro), programa recordatorio 24 h y envía ya.
 *
 * Uso:
 *   npx tsx scripts/send-real-whatsapp-test.ts
 *   npx tsx scripts/send-real-whatsapp-test.ts <appointmentId>
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
import { formatPhoneForMetaWhatsapp, normalizePhoneToE164 } from "../src/whatsapp/phone.js";
import { is24hContactTemplate } from "../src/whatsapp/messageBuilder.js";

const appointmentIdArg = process.argv[2]?.trim();

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

  let appointment = appointmentIdArg
    ? await prisma.appointment.findUnique({
        where: { id: appointmentIdArg },
        include: { patient: true, specialist: true },
      })
    : null;

  if (!appointment) {
    appointment = await prisma.appointment.findFirst({
      where: {
        patient: { phone: { not: null } },
        status: { in: [AppointmentStatus.RESERVED, AppointmentStatus.CONFIRMADO] },
      },
      orderBy: { updatedAt: "desc" },
      include: { patient: true, specialist: true },
    });
  }

  if (!appointment) {
    console.error("✗ No hay turno con paciente con teléfono. Pasá un appointmentId o creá uno en la agenda.");
    process.exit(1);
  }

  const future = new Date();
  future.setDate(future.getDate() + 3);
  future.setHours(10, 0, 0, 0);

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

  console.log("Turno:", appointment.id);
  console.log("Paciente:", appointment.patient.firstName, appointment.patient.lastName);
  const e164 = normalizePhoneToE164(appointment.patient.phone);
  console.log("Teléfono LogoCen:", appointment.patient.phone);
  console.log("Meta (to):", formatPhoneForMetaWhatsapp(e164));
  console.log(
    "Fecha turno:",
    appointment.appointmentDate.toISOString().slice(0, 10),
    appointment.startTime
  );
  console.log("Estado:", appointment.status);
  console.log("");

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
    console.log("\n✓ Mensaje enviado. Revisá WhatsApp del paciente y tocá «Sí, confirmo».");
    console.log("  waMessageId:", updated.waMessageId);
  } else if (updated?.status === "FAILED") {
    console.error("\n✗ Error:", updated.lastError);
    process.exit(1);
  } else {
    console.warn("\n⚠ Estado final:", updated?.status, updated?.lastError ?? "");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
