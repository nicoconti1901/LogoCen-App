import crypto from "node:crypto";
import { whatsappConfig } from "../config/whatsapp.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { parseConfirmButtonId, isWhatsappConfirmText } from "../whatsapp/messageBuilder.js";
import {
  confirmAppointmentFromWhatsapp,
  confirmAppointmentFromWhatsappTextReply,
} from "./whatsappReminder.service.js";

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          type?: string;
          from?: string;
          text?: { body?: string };
          button?: { payload?: string; text?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string };
          };
        }>;
      };
    }>;
  }>;
};

async function confirmFromButtonPayload(from: string | undefined, payload: string | undefined): Promise<void> {
  if (!payload) return;
  const appointmentRef = parseConfirmButtonId(payload);
  if (!appointmentRef) {
    console.warn("[whatsapp] botón con payload no reconocido", { from, payload });
    return;
  }
  const ok = await confirmAppointmentFromWhatsapp(appointmentRef, { waFrom: from });
  const log: Record<string, unknown> = { from, payload, appointmentRef, ok };
  if (!ok) {
    const appt = await appointmentRepository.findById(appointmentRef);
    if (appt) log.statusTurno = appt.status;
  }
  console.info("[whatsapp] botón confirmación", log);
}

export function verifyMetaWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!whatsappConfig.appSecret) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", whatsappConfig.appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

export async function handleMetaWebhookPayload(payload: MetaWebhookPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type === "text") {
          const body = message.text?.body;
          const from = message.from;
          if (from && body && isWhatsappConfirmText(body)) {
            const ok = await confirmAppointmentFromWhatsappTextReply(from, body);
            console.info("[whatsapp] texto confirmación", { from, body, ok });
          }
          continue;
        }

        /** Plantilla Meta: botón quick_reply llega como type "button", no "interactive". */
        if (message.type === "button") {
          const payload = message.button?.payload;
          const text = message.button?.text;
          if (payload) {
            await confirmFromButtonPayload(message.from, payload);
          } else if (message.from && text && isWhatsappConfirmText(text)) {
            const ok = await confirmAppointmentFromWhatsappTextReply(message.from, text);
            console.info("[whatsapp] texto confirmación (botón plantilla)", { from: message.from, text, ok });
          }
          continue;
        }

        if (message.type !== "interactive") continue;
        if (message.interactive?.type !== "button_reply") continue;
        const buttonId = message.interactive.button_reply?.id;
        await confirmFromButtonPayload(message.from, buttonId);
      }
    }
  }
}
