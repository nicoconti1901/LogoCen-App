/**
 * Fuerza el envío del recordatorio 24 h para UN turno (sin mover fecha ni crear turnos).
 *
 * Uso:
 *   npm run whatsapp:force-send -- <appointmentId>
 */
import "dotenv/config";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "../src/config/database.js";
import { isWhatsappConfigured } from "../src/config/whatsapp.js";
import {
  processDueWhatsappReminders,
  syncWhatsappReminderForAppointment,
} from "../src/services/whatsappReminder.service.js";
import { formatStoredDateOnlyISO } from "../src/utils/appointmentTime.js";
import { hoursUntilAppointmentStart } from "../src/whatsapp/reminderSchedule.js";
import { formatPhoneForMetaWhatsapp, normalizePhoneToE164 } from "../src/whatsapp/phone.js";

const appointmentId = process.argv[2]?.trim();

async function main() {
  if (!appointmentId) {
    console.error("Uso: npm run whatsapp:force-send -- <appointmentId>");
    process.exit(1);
  }

  if (!isWhatsappConfigured()) {
    console.error("✗ WhatsApp no configurado en .env");
    process.exit(1);
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, specialist: true },
  });

  if (!appointment) {
    console.error("✗ Turno no encontrado:", appointmentId);
    process.exit(1);
  }

  if (!appointment.patient.phone?.trim()) {
    console.error("✗ El paciente no tiene teléfono.");
    process.exit(1);
  }

  if (appointment.status !== AppointmentStatus.RESERVED) {
    console.error(`✗ Estado ${appointment.status}. Debe estar Agendado (RESERVED).`);
    process.exit(1);
  }

  const hours = hoursUntilAppointmentStart(appointment.appointmentDate, appointment.startTime);
  if (hours < 48) {
    console.error(
      `✗ Faltan ${hours.toFixed(1)} h para el turno (<48 h). LogoCen no envía WhatsApp; queda Confirmado automático.`
    );
    process.exit(1);
  }

  console.log("Turno:", appointment.id);
  console.log(
    "Paciente:",
    appointment.patient.firstName,
    appointment.patient.lastName,
    "→",
    formatPhoneForMetaWhatsapp(normalizePhoneToE164(appointment.patient.phone))
  );
  console.log(
    "Fecha:",
    formatStoredDateOnlyISO(appointment.appointmentDate),
    appointment.startTime,
    "|",
    appointment.specialist.lastName,
    appointment.specialist.firstName
  );
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
    console.error("✗ No se creó recordatorio.");
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

  console.log("Enviando…\n");
  const result = await processDueWhatsappReminders();
  console.log(JSON.stringify(result, null, 2));

  const updated = await prisma.whatsappReminder.findUnique({ where: { id: reminder.id } });
  if (updated?.status === "SENT") {
    console.log("\n✓ Enviado. Tocá «Sí, confirmo» en WhatsApp.");
    console.log("  waMessageId:", updated.waMessageId);
  } else {
    console.error("\n✗", updated?.status, updated?.lastError ?? "");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
