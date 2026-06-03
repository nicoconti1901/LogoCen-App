/**
 * Simula "Sí, confirmo" sin webhook ni ngrok (solo desarrollo local).
 * Usa la misma lógica que Meta cuando el paciente toca el botón.
 *
 * Uso:
 *   npx tsx scripts/simulate-whatsapp-confirm.ts
 *   npx tsx scripts/simulate-whatsapp-confirm.ts <appointmentId>
 */
import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { confirmAppointmentFromWhatsapp } from "../src/services/whatsappReminder.service.js";

const arg = process.argv[2]?.trim();

let appointmentRef = arg;

if (!appointmentRef) {
  const latest = await prisma.whatsappReminder.findFirst({
    where: { status: "SENT" },
    orderBy: { updatedAt: "desc" },
  });
  if (!latest) {
    console.error("No hay recordatorio SENT. Enviá uno antes con resend-latest-reminder.ts");
    process.exit(1);
  }
  appointmentRef = latest.appointmentRef;
  console.log("Usando último recordatorio enviado:", latest.id);
}

const appt = appointmentRef.startsWith("fixed:")
  ? null
  : await prisma.appointment.findUnique({
      where: { id: appointmentRef },
      include: { patient: true },
    });

if (appt) {
  console.log("Turno:", appointmentRef);
  console.log("Paciente:", appt.patient.firstName, appt.patient.lastName);
  console.log("Estado actual:", appt.status);
}

const ok = await confirmAppointmentFromWhatsapp(appointmentRef);
console.log(ok ? "✓ Turno confirmado (CONFIRMADO, origen WHATSAPP)" : "✗ No se pudo confirmar (¿ya estaba confirmado?)");

await prisma.$disconnect();
process.exit(ok ? 0 : 1);
