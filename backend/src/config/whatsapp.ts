import { env } from "./env.js";

export const whatsappConfig = {
  enabled: env.WHATSAPP_ENABLED,
  phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken: env.WHATSAPP_ACCESS_TOKEN,
  verifyToken: env.WHATSAPP_VERIFY_TOKEN,
  appSecret: env.WHATSAPP_APP_SECRET,
  apiVersion: env.WHATSAPP_API_VERSION,
  clinicName: env.CLINIC_NAME,
  clinicAddress: env.CLINIC_ADDRESS,
  /** Teléfono/WhatsApp humano del centro (consultas); distinto del número API de recordatorios. */
  clinicContactPhone: env.CLINIC_CONTACT_PHONE?.trim() || null,
  /** Minutos de espera tras agendar un turno corto antes de enviar la solicitud de confirmación. */
  shortNoticeDelayMinutes: env.WHATSAPP_SHORT_NOTICE_DELAY_MINUTES,
  /** Plantilla Meta para SHORT_NOTICE (&lt;24 h al agendar). */
  reminderTemplateName: env.WHATSAPP_REMINDER_TEMPLATE_NAME?.trim() || null,
  /** Plantilla Meta para STANDARD_24H (24 h antes). */
  reminderTemplate24hName: env.WHATSAPP_REMINDER_TEMPLATE_24H_NAME?.trim() || null,
  reminderTemplateLanguage: env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE,
  /** ID del botón de confirmación (máx. 256 caracteres en Meta). */
  confirmButtonIdPrefix: "cfm",
} as const;

export function isWhatsappConfigured(): boolean {
  return Boolean(
    whatsappConfig.enabled &&
      whatsappConfig.phoneNumberId &&
      whatsappConfig.accessToken
  );
}
