import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { processDueWhatsappReminders } from "../src/services/whatsappReminder.service.js";
import { formatPhoneForMetaWhatsapp, normalizePhoneToE164 } from "../src/whatsapp/phone.js";

const latest = await prisma.whatsappReminder.findFirst({
  orderBy: { updatedAt: "desc" },
});

if (!latest) {
  console.log("No hay recordatorios.");
  process.exit(0);
}

await prisma.whatsappReminder.update({
  where: { id: latest.id },
  data: {
    status: "SCHEDULED",
    scheduledSendAt: new Date(),
    lastError: null,
    waMessageId: null,
    sentAt: null,
  },
});

const appt = latest.appointmentRef.startsWith("fixed:")
  ? null
  : await prisma.appointment.findUnique({
      where: { id: latest.appointmentRef },
      include: { patient: true },
    });

if (appt?.patient.phone) {
  const e164 = normalizePhoneToE164(appt.patient.phone);
  console.log("Paciente:", appt.patient.firstName, appt.patient.lastName);
  console.log("Teléfono:", appt.patient.phone);
  console.log("Enviando a Meta (to):", formatPhoneForMetaWhatsapp(e164));
}

const result = await processDueWhatsappReminders();
console.log(JSON.stringify(result, null, 2));

await prisma.$disconnect();
