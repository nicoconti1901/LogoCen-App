import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../../.env") });

const prisma = new PrismaClient();
const MARKER = "[CARGA-PRUEBA]";

function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return "(no definida)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return "(inválida)";
  }
}

const c = await prisma.appointment.count({ where: { reasonForVisit: MARKER } });
const minMax = await prisma.appointment.aggregate({
  where: { reasonForVisit: MARKER },
  _min: { appointmentDate: true },
  _max: { appointmentDate: true },
});

const bySpec = await prisma.appointment.groupBy({
  by: ["specialistId"],
  where: { reasonForVisit: MARKER },
  _count: true,
});

console.log("BD:", maskDatabaseUrl(process.env.DATABASE_URL));
console.log(`Turnos de prueba (${MARKER}):`, c);
if (c > 0) {
  console.log(
    "Fechas:",
    minMax._min.appointmentDate?.toISOString().slice(0, 10),
    "→",
    minMax._max.appointmentDate?.toISOString().slice(0, 10)
  );
  console.log("Por especialista (ids):", bySpec);
} else {
  console.log("No hay turnos de carga. Ejecutá: npm run db:seed-appointments");
}

await prisma.$disconnect();
