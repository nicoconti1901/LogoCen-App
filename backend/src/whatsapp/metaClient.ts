import { whatsappConfig, isWhatsappConfigured } from "../config/whatsapp.js";
import {
  CONFIRM_BUTTON_TITLE,
  buildConfirmButtonId,
  buildReminderTemplateComponents,
  type ReminderMessageContext,
} from "./messageBuilder.js";
import { formatPhoneForMetaWhatsapp } from "./phone.js";

export type SendInteractiveResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendConfirmationReminderMessage(
  toE164: string,
  bodyText: string,
  appointmentRef: string,
  templateContext?: ReminderMessageContext
): Promise<SendInteractiveResult> {
  if (!isWhatsappConfigured()) {
    return { ok: false, error: "WhatsApp no está configurado" };
  }

  const to = formatPhoneForMetaWhatsapp(toE164);
  if (!to) {
    return { ok: false, error: "Teléfono del destinatario inválido" };
  }

  const url = `https://graph.facebook.com/${whatsappConfig.apiVersion}/${whatsappConfig.phoneNumberId}/messages`;

  const useTemplate = Boolean(whatsappConfig.reminderTemplateName && templateContext);

  const payload = useTemplate
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: whatsappConfig.reminderTemplateName,
          language: { code: whatsappConfig.reminderTemplateLanguage },
          components: buildReminderTemplateComponents(templateContext!, appointmentRef),
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: buildConfirmButtonId(appointmentRef),
                  title: CONFIRM_BUTTON_TITLE,
                },
              },
            ],
          },
        },
      };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappConfig.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };

    if (!res.ok) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }

    const messageId = data.messages?.[0]?.id;
    if (!messageId) return { ok: false, error: "Respuesta sin message id" };
    return { ok: true, messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red";
    return { ok: false, error: msg };
  }
}
