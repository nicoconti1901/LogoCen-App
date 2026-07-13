import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  /** Duración de la sesión (p. ej. 90d, 365d). Sin refresh token: al expirar habrá que volver a iniciar sesión. */
  JWT_EXPIRES_IN: z.string().default("365d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /** Secreto para endpoint interno de cron (recordatorios WhatsApp). */
  CRON_SECRET: z.string().optional(),
  WHATSAPP_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Recordatorios 24 h (programar y enviar). false = pausado; las credenciales pueden quedar cargadas. */
  WHATSAPP_REMINDERS_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true" || v === "1")),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  /** ID de la cuenta WhatsApp Business (WABA). Solo diagnóstico / suscripción webhook. */
  WHATSAPP_WABA_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  WHATSAPP_SHORT_NOTICE_DELAY_MINUTES: z.coerce.number().int().min(1).max(120).default(5),
  /** Plantilla SHORT_NOTICE (&lt;24 h al agendar), ej. recordatorio_turno_v3. Vacío = interactivo. */
  WHATSAPP_REMINDER_TEMPLATE_NAME: z.string().optional(),
  /** Plantilla STANDARD_24H (24 h antes del turno), ej. recordatorio_turno_24h. Vacío = interactivo. */
  WHATSAPP_REMINDER_TEMPLATE_24H_NAME: z.string().optional(),
  WHATSAPP_REMINDER_TEMPLATE_LANGUAGE: z.string().default("es_AR"),
  CLINIC_NAME: z.string().default("LogoCen"),
  CLINIC_ADDRESS: z
    .string()
    .default("Av. Corrientes 1234, CABA (dirección provisoria — actualizar en configuración)"),
  /** WhatsApp/teléfono del centro para consultas (no el número de la API). Se envía como enlace wa.me en la plantilla 24 h. */
  CLINIC_CONTACT_PHONE: z.string().optional(),
});

export const env = envSchema.parse(process.env);
