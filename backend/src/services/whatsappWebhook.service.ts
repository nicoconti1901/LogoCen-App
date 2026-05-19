import crypto from "node:crypto";
import { whatsappConfig } from "../config/whatsapp.js";
import { parseConfirmButtonId } from "../whatsapp/messageBuilder.js";
import { confirmAppointmentFromWhatsapp } from "./whatsappReminder.service.js";

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          type?: string;
          from?: string;
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
        if (message.type !== "interactive") continue;
        if (message.interactive?.type !== "button_reply") continue;
        const buttonId = message.interactive.button_reply?.id;
        if (!buttonId) continue;

        const appointmentRef = parseConfirmButtonId(buttonId);
        if (!appointmentRef) continue;

        await confirmAppointmentFromWhatsapp(appointmentRef);
      }
    }
  }
}
