/**
 * Ejecuta recordatorios WhatsApp pendientes (para cron del SO o tarea programada).
 * Uso: npx tsx scripts/run-whatsapp-reminders.ts
 */
import "dotenv/config";
import { processDueWhatsappReminders } from "../src/services/whatsappReminder.service.js";

async function main() {
  const result = await processDueWhatsappReminders();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
