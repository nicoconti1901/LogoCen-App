/**
 * Elimina turnos creados por seed-week-appointments.ts (marcador [CARGA-PRUEBA]).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../../.env") });
import { PrismaClient } from "@prisma/client";

const MARKER = "[CARGA-PRUEBA]";
const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

  const count = await prisma.appointment.count({
    where: { reasonForVisit: MARKER },
  });

  console.log(`Turnos con marcador "${MARKER}": ${count}`);

  if (count === 0) {
    console.log("Nada que borrar.");
    return;
  }

  if (dryRun) {
    console.log("DRY RUN: no se borró nada.");
    return;
  }

  const deleted = await prisma.appointment.deleteMany({
    where: { reasonForVisit: MARKER },
  });

  console.log(`Eliminados: ${deleted.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
