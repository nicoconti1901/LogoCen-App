import { Weekday } from "@prisma/client";
import { z } from "zod";
import { normalizePhoneToE164 } from "../whatsapp/phone.js";
import { parseDateOnlyISO, toDateOnly } from "./appointmentTime.js";

export const PERSON_NAME_MIN = 2;
export const PERSON_NAME_MAX = 80;
export const NOTES_MAX = 2000;
export const DIAGNOSIS_MAX = 5000;
export const CONSIDERATIONS_MAX = 10_000;
export const MEDICAL_RECORD_MAX = 5000;
export const REASON_MAX = 1000;
export const EXPENSE_DESC_MAX = 200;
export const LICENSE_MAX = 50;

const PERSON_NAME_REGEX = /^[\p{L}][\p{L}\s'.-]*$/u;
const PHONE_DIGITS_REGEX = /^\d{10,15}$/;
const DOCUMENT_ID_REGEX = /^(\d{7,8}|[A-Za-z0-9]{6,12})$/;
export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MONEY_REGEX = /^\d+([.,]\d{1,2})?$/;
const TRANSFER_ALIAS_REGEX = /^[A-Za-z0-9.]{6,20}$/;

export function stripPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizeMoneyInput(raw: string): string {
  return raw.trim().replace(",", ".");
}

export const personNameSchema = z
  .string()
  .trim()
  .min(PERSON_NAME_MIN, "El nombre debe tener al menos 2 caracteres")
  .max(PERSON_NAME_MAX, "Máximo 80 caracteres")
  .regex(PERSON_NAME_REGEX, "Solo letras, espacios, guiones y apóstrofes");

export const emailSchema = z
  .string()
  .trim()
  .email("Correo inválido")
  .transform((s) => s.toLowerCase());

export const strongPasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/,
    "La contraseña debe tener mayúscula, minúscula, número y símbolo"
  );

export const timeSchema = z.string().regex(TIME_REGEX, "Use HH:mm (24 h)");

export const dateOnlyStringSchema = z
  .string()
  .regex(DATE_ONLY_REGEX, "Use formato AAAA-MM-DD");

export const optionalDateOnlyStringSchema = z
  .union([dateOnlyStringSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => {
    const t = typeof v === "string" ? v.trim() : "";
    return t || null;
  });

export const birthDateSchema = z
  .union([dateOnlyStringSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => {
    const t = typeof v === "string" ? v.trim() : "";
    if (!t) return null;
    return parseDateOnlyISO(t);
  })
  .refine((d) => d === null || d <= toDateOnly(new Date()), {
    message: "La fecha de nacimiento no puede ser futura",
  });

export const optionalPhoneSchema = z
  .union([z.string(), z.literal(""), z.null()])
  .optional()
  .superRefine((v, ctx) => {
    const t = (v ?? "").trim();
    if (!t) return;
    if (!PHONE_DIGITS_REGEX.test(stripPhoneDigits(t))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Teléfono inválido (10 a 15 dígitos)",
      });
    }
  })
  .transform((v) => {
    const t = (v ?? "").trim();
    return t || null;
  });

/** Celular del paciente: obligatorio y compatible con WhatsApp (E.164 AR). */
export const patientWhatsappPhoneSchema = z
  .string()
  .trim()
  .min(1, "El celular es obligatorio para recordatorios por WhatsApp")
  .superRefine((v, ctx) => {
    if (!normalizePhoneToE164(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Formato inválido. Usá móvil argentino: 10 dígitos (área + número) o +54 9 y el número, sin 15 delante",
      });
    }
  });

export const optionalDocumentIdSchema = z
  .union([z.string(), z.literal(""), z.null()])
  .optional()
  .superRefine((v, ctx) => {
    const t = (v ?? "").trim();
    if (!t) return;
    if (!DOCUMENT_ID_REGEX.test(t)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Documento inválido (DNI 7-8 dígitos o pasaporte alfanumérico)",
      });
    }
  })
  .transform((v) => {
    const t = (v ?? "").trim();
    return t || null;
  });

export const optionalLongTextSchema = (max: number) =>
  z
    .union([z.string().max(max), z.literal(""), z.null()])
    .optional()
    .transform((v) => {
      const t = (v ?? "").trim();
      return t || null;
    });

export const optionalMoneySchema = z
  .union([z.number().nonnegative(), z.string(), z.literal(""), z.null()])
  .optional()
  .superRefine((v, ctx) => {
    if (v === null || v === undefined || v === "") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Monto inválido" });
      }
      return;
    }
    const normalized = normalizeMoneyInput(String(v));
    if (!normalized || !MONEY_REGEX.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monto inválido (use números, coma o punto decimal)",
      });
    }
  });

export const requiredNonNegativeMoneySchema = z
  .union([z.number().nonnegative(), z.string()])
  .superRefine((v, ctx) => {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Monto inválido" });
      }
      return;
    }
    const normalized = normalizeMoneyInput(String(v));
    if (!normalized || !MONEY_REGEX.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monto inválido (use números, coma o punto decimal)",
      });
    }
  });
export const positiveMoneySchema = z
  .union([z.number(), z.string()])
  .superRefine((v, ctx) => {
    const normalized = typeof v === "number" ? String(v) : normalizeMoneyInput(String(v));
    if (!MONEY_REGEX.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monto inválido (use números, coma o punto decimal)",
      });
      return;
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El monto debe ser mayor a 0" });
    }
  });

export const optionalTransferAliasSchema = z
  .union([z.string(), z.literal(""), z.null()])
  .optional()
  .superRefine((v, ctx) => {
    const t = (v ?? "").trim();
    if (!t) return;
    if (!TRANSFER_ALIAS_REGEX.test(t)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Alias inválido (6-20 caracteres, letras, números y puntos)",
      });
    }
  })
  .transform((v) => {
    const t = (v ?? "").trim();
    return t || null;
  });

export const optionalLicenseSchema = z
  .union([z.string().max(LICENSE_MAX), z.literal(""), z.null()])
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t || null;
  });

export function endTimeAfterStart(startTime: string, endTime: string): boolean {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em > sh * 60 + sm;
}

export const availabilitySchema = z
  .object({
    weekday: z.nativeEnum(Weekday),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((row) => endTimeAfterStart(row.startTime, row.endTime), {
    message: "La hora de fin debe ser posterior al inicio",
    path: ["endTime"],
  });
