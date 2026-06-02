import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { processDueWhatsappReminders } from "../src/services/whatsappReminder.service.js";

const updated = await prisma.whatsappReminder.updateMany({
  where: { status: "SCHEDULED", kind: "STANDARD_24H" },
  data: { scheduledSendAt: new Date() },
});
console.log("Recordatorios adelantados:", updated.count);

const result = await processDueWhatsappReminders();
console.log(JSON.stringify(result, null, 2));

await prisma.$disconnect();
