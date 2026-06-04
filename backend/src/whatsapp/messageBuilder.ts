import { WhatsappReminderKind } from "@prisma/client";
import { whatsappConfig } from "../config/whatsapp.js";
import { formatStoredDateEs } from "../utils/appointmentTime.js";
import { buildClinicWaMeLink, formatClinicContactDisplay } from "./phone.js";

export type ReminderMessageContext = {
  patientFirstName: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  specialistName: string;
  consultorio: string;
  kind: WhatsappReminderKind;
};

function formatTimeRange(start: string, end: string): string {
  return `${start} a ${end} hs`;
}

export function buildReminderBody(ctx: ReminderMessageContext): string {
  const lugar = whatsappConfig.clinicName;
  const direccion = whatsappConfig.clinicAddress;
  const nombre = ctx.patientFirstName.trim() || "paciente";
  const fecha = formatStoredDateEs(ctx.appointmentDate);
  const horario = formatTimeRange(ctx.startTime, ctx.endTime);
  const especialista = ctx.specialistName;
  const sala = ctx.consultorio.trim() || "consultorio asignado";

  const intro = `Hola ${nombre}, te recordamos tu turno en *${lugar}*:`;

  return [
    intro,
    "",
    `📍 *${lugar}*`,
    direccion,
    "",
    `📅 ${fecha}`,
    `🕐 ${horario}`,
    `👨‍⚕️ ${especialista}`,
    `🏥 ${sala}`,
    "",
    contactLineForReminder(),
    "",
    "Tocá el botón para confirmar tu asistencia.",
    "Si no ves el botón, respondé *CONFIRMO* a este chat.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function contactLineForReminder(): string {
  const link = buildClinicWaMeLink(whatsappConfig.clinicContactPhone);
  if (link) {
    return `Este chat es solo para recordatorios. Consultas: ${link}`;
  }
  const display = formatClinicContactDisplay(whatsappConfig.clinicContactPhone);
  if (display) {
    return `Este chat es solo para recordatorios. Consultas: ${display}`;
  }
  return "";
}

/** ID del botón interactivo (Meta, máx. 256 caracteres). */
export function buildConfirmButtonId(appointmentRef: string): string {
  const safe = appointmentRef.replace(/:/g, "_");
  return `${whatsappConfig.confirmButtonIdPrefix}_${safe}`;
}

/** Nombre del centro en plantillas: todo en mayúsculas ({{2}}). */
function formatTemplateClinicName(): string {
  const name = whatsappConfig.clinicName.trim() || "LogoCen";
  return name.toLocaleUpperCase("es-AR");
}

/** Primera letra del texto en mayúscula (p. ej. fecha). */
function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase("es-AR") + trimmed.slice(1);
}

/** Primera letra en mayúscula por palabra o segmento tras coma. */
function capitalizeTemplateText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/(?:^|[\s,]+)(\S)/g, (match, char: string, offset: number) => {
    const prefix = match.slice(0, match.length - char.length);
    return prefix + char.toLocaleUpperCase("es-AR");
  });
}

/** Dirección para 📍 {{6}} en plantillas v3 / 24h (`CLINIC_ADDRESS`). */
function formatTemplateAddressOnly(): string {
  const raw = whatsappConfig.clinicAddress.trim() || "Consultá la dirección con el centro";
  return capitalizeTemplateText(raw);
}

/**
 * {{7}} en plantilla 24 h: URL `https://wa.me/...` (WhatsApp la muestra como hipervínculo).
 * No usar solo el número en texto plano.
 */
export function formatTemplateClinicContactLink(): string {
  const link = buildClinicWaMeLink(whatsappConfig.clinicContactPhone);
  if (link) return link;
  const display = formatClinicContactDisplay(whatsappConfig.clinicContactPhone);
  if (display) return display;
  return "Consultá el teléfono del centro en la recepción";
}

type TemplateVarValues = {
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  7?: string;
};

function buildTemplateVarValues(
  ctx: ReminderMessageContext,
  fecha: string,
  nombre: string
): TemplateVarValues {
  return {
    1: capitalizeTemplateText(nombre),
    2: formatTemplateClinicName(),
    3: capitalizeFirst(fecha),
    4: ctx.startTime,
    5: capitalizeTemplateText(ctx.specialistName),
    6: formatTemplateAddressOnly(),
    7: formatTemplateClinicContactLink(),
  };
}

/** Meta exige parámetros en orden de primera aparición en el cuerpo, no por número {{N}}. */
function parametersInAppearanceOrder(
  values: TemplateVarValues,
  order: readonly number[]
): Array<{ type: "text"; text: string }> {
  return order.map((n) => {
    const text = values[n as keyof TemplateVarValues];
    if (text == null || text === "") {
      throw new Error(`Falta valor para variable de plantilla {{${n}}}`);
    }
    return { type: "text" as const, text };
  });
}

/**
 * Plantilla 7 vars (revisión Meta): {{1}}, {{2}}, luego {{6}} en 📍 antes de {{3}}-{{5}}, después {{7}}.
 */
const APPEARANCE_ORDER_24H_CONTACT = [1, 2, 6, 3, 4, 5, 7] as const;

/**
 * Plantilla 6 vars estándar: {{1}}…{{6}} en orden del texto (📅 {{3}}, 🕐 {{4}}, 🧑‍⚕️ {{5}}, 📍 {{6}}).
 */
const APPEARANCE_ORDER_24H_SIX = [1, 2, 3, 4, 5, 6] as const;

function buildSevenVar24hReminderParameters(
  ctx: ReminderMessageContext,
  fecha: string,
  nombre: string
): Array<{ type: "text"; text: string }> {
  return parametersInAppearanceOrder(buildTemplateVarValues(ctx, fecha, nombre), APPEARANCE_ORDER_24H_CONTACT);
}

function buildSixVarIconReminderParameters(
  ctx: ReminderMessageContext,
  fecha: string,
  nombre: string
): Array<{ type: "text"; text: string }> {
  return parametersInAppearanceOrder(buildTemplateVarValues(ctx, fecha, nombre), APPEARANCE_ORDER_24H_SIX);
}

/** Plantilla 24 h aprobada (6 variables, sin contacto). */
export const TEMPLATE_REMINDER_24H = "recordatorio_turno_24h";

/** Plantilla 24 h con enlace wa.me del centro (7 variables). */
export const TEMPLATE_REMINDER_24H_CONTACT = "recordatorio_turno_24hs_contacto";

const TEMPLATE_24H_CONTACT_ALIASES = new Set([
  TEMPLATE_REMINDER_24H_CONTACT,
  "recordatorio_turno_24h_contact",
]);

export function is24hContactTemplate(templateName: string): boolean {
  return TEMPLATE_24H_CONTACT_ALIASES.has(templateName);
}

/**
 * Plantillas Meta (Utilidad, es_AR, variables posicionales).
 *
 * `recordatorio_turno_24h`: 6 vars en orden 1,2,3,4,5,6 del cuerpo.
 * `recordatorio_turno_24hs_contacto`: 7 vars en orden de aparición 1,2,6,3,4,5,7 ({{6}} va en 📍 antes de fecha/hora).
 */
export function buildReminderTemplateComponents(
  ctx: ReminderMessageContext,
  appointmentRef: string,
  templateName: string
): Array<Record<string, unknown>> {
  const fecha = formatStoredDateEs(ctx.appointmentDate);
  const horario = formatTimeRange(ctx.startTime, ctx.endTime);
  const nombre = ctx.patientFirstName.trim() || "paciente";
  const sala = ctx.consultorio.trim() || "consultorio asignado";
  const direccion = whatsappConfig.clinicAddress.trim() || "Consultá la dirección con el centro";

  let bodyParameters: Array<{ type: "text"; text: string }>;

  if (is24hContactTemplate(templateName)) {
    bodyParameters = buildSevenVar24hReminderParameters(ctx, fecha, nombre);
  } else if (
    templateName === TEMPLATE_REMINDER_24H ||
    templateName === "recordatorio_turno_v3"
  ) {
    bodyParameters = buildSixVarIconReminderParameters(ctx, fecha, nombre);
  } else if (templateName === "recordatorio_turno_v2") {
    bodyParameters = [
      { type: "text", text: capitalizeTemplateText(nombre) },
      { type: "text", text: formatTemplateClinicName() },
      { type: "text", text: capitalizeFirst(fecha) },
      { type: "text", text: horario },
      { type: "text", text: capitalizeTemplateText(ctx.specialistName) },
      { type: "text", text: capitalizeTemplateText(sala) },
      { type: "text", text: capitalizeTemplateText(direccion) },
    ];
  } else {
    bodyParameters = [
      { type: "text", text: capitalizeTemplateText(nombre) },
      { type: "text", text: formatTemplateClinicName() },
      { type: "text", text: capitalizeFirst(fecha) },
      { type: "text", text: horario },
      { type: "text", text: capitalizeTemplateText(ctx.specialistName) },
      { type: "text", text: capitalizeTemplateText(sala) },
    ];
  }

  return [
    {
      type: "body",
      parameters: bodyParameters,
    },
    {
      type: "button",
      sub_type: "quick_reply",
      index: "0",
      parameters: [{ type: "payload", payload: buildConfirmButtonId(appointmentRef) }],
    },
  ];
}

export function parseConfirmButtonId(buttonId: string): string | null {
  const prefix = `${whatsappConfig.confirmButtonIdPrefix}_`;
  if (!buttonId.startsWith(prefix)) return null;
  const rest = buttonId.slice(prefix.length);
  if (rest.startsWith("fixed_")) {
    const withoutFixed = rest.slice("fixed_".length);
    const lastUnderscore = withoutFixed.lastIndexOf("_");
    if (lastUnderscore <= 0) return null;
    const seriesId = withoutFixed.slice(0, lastUnderscore);
    const dateIso = withoutFixed.slice(lastUnderscore + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
    return `fixed:${seriesId}:${dateIso}`;
  }
  return rest;
}

export const CONFIRM_BUTTON_TITLE = "Sí, confirmo";

const CONFIRM_TEXT_PATTERN = /^(si|confirmo|confirma|confirmar|ok)$/i;

/** Respuestas de texto cuando no aparece el botón interactivo (modo prueba Meta). */
export function isWhatsappConfirmText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (CONFIRM_TEXT_PATTERN.test(normalized)) return true;
  return normalized.includes("confirmo") || normalized.includes("confirma");
}
