/**
 * Busca turno en producción vía API y fuerza envío WhatsApp.
 *
 * Uso:
 *   npx tsx scripts/find-and-force-send-prod.ts --send
 */
import "dotenv/config";
import { AppointmentStatus, WhatsappReminderKind } from "@prisma/client";
import { isWhatsappConfigured } from "../src/config/whatsapp.js";
import { buildReminderBody } from "../src/whatsapp/messageBuilder.js";
import { sendConfirmationReminderMessage } from "../src/whatsapp/metaClient.js";
import { normalizePhoneToE164 } from "../src/whatsapp/phone.js";
import { parseDateOnlyISO } from "../src/utils/appointmentTime.js";

const apiBase = (process.env.API_URL ?? "https://logocen-app.onrender.com/api").replace(/\/$/, "");
const email = (process.env.SEED_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "admin@clinica.com")
  .toLowerCase()
  .trim();
const password = process.env.SEED_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "Admin123!";
const shouldSend = process.argv.includes("--send");

type AppointmentRow = {
  id: string;
  appointmentDate: string;
  date?: string;
  startTime: string;
  endTime: string;
  status: string;
  consultorio?: string;
  patient?: { firstName: string; lastName: string; phone?: string | null };
  specialist?: { firstName: string; lastName: string };
};

async function login(): Promise<string> {
  const res = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login falló (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function fetchAppointments(token: string, from: string, to: string): Promise<AppointmentRow[]> {
  const url = `${apiBase}/appointments?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`List appointments falló (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<AppointmentRow[]>;
}

function matchesTarget(a: AppointmentRow): boolean {
  const date = (a.date ?? a.appointmentDate).slice(0, 10);
  const patient = `${a.patient?.firstName ?? ""} ${a.patient?.lastName ?? ""}`.toLowerCase();
  const specialist = `${a.specialist?.firstName ?? ""} ${a.specialist?.lastName ?? ""}`.toLowerCase();
  return (
    date === "2026-06-25" &&
    a.startTime.startsWith("10:") &&
    patient.includes("gonzalo") &&
    patient.includes("mart") &&
    (specialist.includes("conti") || specialist.includes("nico"))
  );
}

async function forceSendViaProductionApi(appointmentId: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const res = await fetch(`${apiBase}/internal/whatsapp/reminders/force-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Secret": secret,
    },
    body: JSON.stringify({ appointmentRef: appointmentId }),
  });
  if (!res.ok) return false;
  console.log(await res.json());
  return true;
}

async function forceSendViaMeta(a: AppointmentRow) {
  if (!isWhatsappConfigured()) throw new Error("WhatsApp no configurado en .env local");
  if (!a.patient?.phone) throw new Error("Paciente sin teléfono");

  const appointmentDate = parseDateOnlyISO((a.date ?? a.appointmentDate).slice(0, 10));
  const specialistName = `${a.specialist?.lastName ?? ""}, ${a.specialist?.firstName ?? ""}`.trim();
  const ctx = {
    patientFirstName: a.patient.firstName,
    appointmentDate,
    startTime: a.startTime,
    endTime: a.endTime,
    specialistName,
    consultorio: a.consultorio ?? "Consultorio 1",
    kind: WhatsappReminderKind.STANDARD_24H,
  };

  const body = buildReminderBody(ctx);
  const result = await sendConfirmationReminderMessage(
    normalizePhoneToE164(a.patient.phone),
    body,
    a.id,
    ctx
  );

  if (!result.ok) throw new Error(result.error);
  console.log("✓ Mensaje enviado vía Meta API");
  console.log("  waMessageId:", result.messageId);
  console.log("  turno producción:", a.id);
}

async function main() {
  console.log("API:", apiBase);
  const token = await login();
  const rows = await fetchAppointments(token, "2026-06-22", "2026-06-28");
  const matches = rows.filter(matchesTarget);

  console.log(
    "Turno:",
    matches.map((a) => ({
      id: a.id,
      date: (a.date ?? a.appointmentDate).slice(0, 10),
      start: a.startTime,
      status: a.status,
      patient: `${a.patient?.lastName}, ${a.patient?.firstName}`,
      phone: a.patient?.phone,
      specialist: `${a.specialist?.lastName}, ${a.specialist?.firstName}`,
    }))[0] ?? null
  );

  const target = matches[0];
  if (!target) {
    console.error("✗ No encontré el turno (25/jun 10:00 Gonzalo Martinez + Conti Nico).");
    process.exit(1);
  }

  if (!shouldSend) {
    console.log("\nID:", target.id);
    console.log("Para enviar: npx tsx scripts/find-and-force-send-prod.ts --send");
    return;
  }

  if (target.status !== AppointmentStatus.RESERVED) {
    console.error("✗ Estado", target.status, "— debe estar Agendado.");
    process.exit(1);
  }

  console.log("\nForzando envío…");
  const viaApi = await forceSendViaProductionApi(target.id);
  if (viaApi) {
    console.log("✓ Enviado desde producción (Render). Tocá «Sí, confirmo».");
    return;
  }

  console.log("(Endpoint force-send aún no desplegado → envío directo Meta)\n");
  await forceSendViaMeta(target);
  console.log("\nRevisá WhatsApp y tocá «Sí, confirmo». El turno está en producción y debería verse en la agenda.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
