/**
 * Borra turnos de prueba WhatsApp y sus recordatorios.
 *
 * Uso:
 *   npx tsx scripts/cleanup-whatsapp-test.ts
 *   npx tsx scripts/cleanup-whatsapp-test.ts <appointmentId>
 */
import "dotenv/config";
import { prisma } from "../src/config/database.js";

const TEST_MARKER = "[WhatsApp test]";
const idArg = process.argv[2]?.trim();

async function main() {
  if (idArg) {
    const appt = await prisma.appointment.findUnique({ where: { id: idArg } });
    if (!appt) {
      console.error("✗ Turno no encontrado:", idArg);
      process.exit(1);
    }
    const reminders = await prisma.whatsappReminder.deleteMany({
      where: { appointmentRef: idArg },
    });
    await prisma.appointment.delete({ where: { id: idArg } });
    console.log("✓ Turno borrado:", idArg);
    console.log("  Recordatorios borrados:", reminders.count);
    return;
  }

  const testAppts = await prisma.appointment.findMany({
    where: { reasonForVisit: { startsWith: TEST_MARKER } },
    select: { id: true, appointmentDate: true, startTime: true, reasonForVisit: true },
  });

  if (!testAppts.length) {
    console.log("No hay turnos marcados como prueba WhatsApp.");
    console.log(`Para borrar uno puntual: npx tsx scripts/cleanup-whatsapp-test.ts <appointmentId>`);
    return;
  }

  for (const a of testAppts) {
    await prisma.whatsappReminder.deleteMany({ where: { appointmentRef: a.id } });
    await prisma.appointment.delete({ where: { id: a.id } });
    console.log(
      "✓ Borrado",
      a.id,
      a.appointmentDate.toISOString().slice(0, 10),
      a.startTime
    );
  }
  console.log(`\nTotal: ${testAppts.length} turno(s) de prueba.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
