import crypto from "node:crypto";
import { whatsappConfig } from "../config/whatsapp.js";
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
          interactive?: {
            type?: string;
            button_reply?: { id?: string };
          };
        }>;
      };
    }>;
  }>;
};

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

        if (message.type !== "interactive") continue;
        if (message.interactive?.type !== "button_reply") continue;
        const buttonId = message.interactive.button_reply?.id;
        if (!buttonId) continue;

        const appointmentRef = parseConfirmButtonId(buttonId);
        if (!appointmentRef) continue;

        const ok = await confirmAppointmentFromWhatsapp(appointmentRef);
        console.info("[whatsapp] botón confirmación", { from: message.from, buttonId, ok });
      }
    }
  }
}
