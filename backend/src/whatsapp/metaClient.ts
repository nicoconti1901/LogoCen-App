import { WhatsappReminderKind } from "@prisma/client";
import { whatsappConfig, isWhatsappConfigured } from "../config/whatsapp.js";
import {
  CONFIRM_BUTTON_TITLE,
  buildConfirmButtonId,
  buildReminderTemplateComponents,
  type ReminderMessageContext,
} from "./messageBuilder.js";
import { formatPhoneForMetaWhatsapp } from "./phone.js";

/** v3 = SHORT_NOTICE; recordatorio_turno_24h = STANDARD_24H; legacy v1/v2 aplican a ambos si no hay 24h. */
export function resolveReminderTemplateName(kind: WhatsappReminderKind): string | null {
  if (kind === WhatsappReminderKind.SHORT_NOTICE) {
    return whatsappConfig.reminderTemplateName;
  }

  if (whatsappConfig.reminderTemplate24hName) {
    return whatsappConfig.reminderTemplate24hName;
  }

  const primary = whatsappConfig.reminderTemplateName;
  if (primary && primary !== "recordatorio_turno_v3") {
    return primary;
  }

  return null;
}

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

  const templateName = templateContext
    ? resolveReminderTemplateName(templateContext.kind)
    : null;
  const useTemplate = Boolean(templateName && templateContext);

  const payload = useTemplate
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: whatsappConfig.reminderTemplateLanguage },
          components: buildReminderTemplateComponents(
            templateContext!,
            appointmentRef,
            templateName!
          ),
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
