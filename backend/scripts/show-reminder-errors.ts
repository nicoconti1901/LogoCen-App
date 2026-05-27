import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { formatPhoneForMetaWhatsapp, normalizePhoneToE164 } from "../src/whatsapp/phone.js";

const rows = await prisma.whatsappReminder.findMany({
  orderBy: { updatedAt: "desc" },
  take: 5,
});
for (const r of rows) {
  console.log({
    id: r.id,
    status: r.status,
    kind: r.kind,
    scheduledSendAt: r.scheduledSendAt,
    lastError: r.lastError,
    appointmentRef: r.appointmentRef,
  });
}

const latest = rows[0];
if (latest) {
  const fixed = latest.appointmentRef.startsWith("fixed:");
  const appt = fixed
    ? null
    : await prisma.appointment.findUnique({
        where: { id: latest.appointmentRef },
        include: { patient: true },
      });
  if (appt) {
    console.log("\nÚltimo recordatorio:");
    console.log("Estado:", latest.status);
    console.log("waMessageId:", latest.waMessageId);
    console.log("Paciente:", appt.patient.firstName, appt.patient.lastName);
    console.log("Teléfono en LogoCen:", appt.patient.phone);
    console.log("Normalizado E.164:", normalizePhoneToE164(appt.patient.phone));
    const e164 = normalizePhoneToE164(appt.patient.phone);
    console.log("E.164:", e164);
    console.log("Enviado a Meta (to):", formatPhoneForMetaWhatsapp(e164));
  }
}

await prisma.$disconnect();
