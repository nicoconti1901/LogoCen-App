import { WhatsappReminderKind } from "@prisma/client";
import { whatsappConfig } from "../config/whatsapp.js";

export type ReminderMessageContext = {
  patientFirstName: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  specialistName: string;
  consultorio: string;
  kind: WhatsappReminderKind;
};

function formatDateEs(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeRange(start: string, end: string): string {
  return `${start} a ${end} hs`;
}

export function buildReminderBody(ctx: ReminderMessageContext): string {
  const lugar = whatsappConfig.clinicName;
  const direccion = whatsappConfig.clinicAddress;
  const nombre = ctx.patientFirstName.trim() || "paciente";
  const fecha = formatDateEs(ctx.appointmentDate);
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
    "Tocá el botón para confirmar tu asistencia.",
    "Si no ves el botón, respondé *CONFIRMO* a este chat.",
  ].join("\n");
}

/** ID del botón interactivo (Meta, máx. 256 caracteres). */
export function buildConfirmButtonId(appointmentRef: string): string {
  const safe = appointmentRef.replace(/:/g, "_");
  return `${whatsappConfig.confirmButtonIdPrefix}_${safe}`;
}

/** Dirección para 📍 {{6}} en plantillas v3 / 24h (`CLINIC_ADDRESS`). */
function formatTemplateAddressOnly(): string {
  return whatsappConfig.clinicAddress.trim() || "Consultá la dirección con el centro";
}

function buildSixVarIconReminderParameters(
  ctx: ReminderMessageContext,
  fecha: string,
  nombre: string
): Array<{ type: "text"; text: string }> {
  return [
    { type: "text", text: nombre },
    { type: "text", text: whatsappConfig.clinicName },
    { type: "text", text: fecha },
    { type: "text", text: ctx.startTime },
    { type: "text", text: ctx.specialistName },
    { type: "text", text: formatTemplateAddressOnly() },
  ];
}

/**
 * Plantillas Meta (Utilidad, es_AR, variables posicionales).
 *
 * `recordatorio_turno_v3` (SHORT_NOTICE): «menos de 24hs» — 6 vars, footer fijo en Meta.
 * `recordatorio_turno_24h` (STANDARD_24H): recordatorio 24 h antes — mismas 6 vars.
 * 1=nombre, 2=centro, 3=fecha, 4=hora inicio, 5=profesional, 6=dirección (`CLINIC_ADDRESS`)
 */
export function buildReminderTemplateComponents(
  ctx: ReminderMessageContext,
  appointmentRef: string,
  templateName: string
): Array<Record<string, unknown>> {
  const fecha = formatDateEs(ctx.appointmentDate);
  const horario = formatTimeRange(ctx.startTime, ctx.endTime);
  const nombre = ctx.patientFirstName.trim() || "paciente";
  const sala = ctx.consultorio.trim() || "consultorio asignado";
  const direccion = whatsappConfig.clinicAddress.trim() || "Consultá la dirección con el centro";

  let bodyParameters: Array<{ type: "text"; text: string }>;

  if (templateName === "recordatorio_turno_v3" || templateName === "recordatorio_turno_24h") {
    bodyParameters = buildSixVarIconReminderParameters(ctx, fecha, nombre);
  } else if (templateName === "recordatorio_turno_v2") {
    bodyParameters = [
      { type: "text", text: nombre },
      { type: "text", text: whatsappConfig.clinicName },
      { type: "text", text: fecha },
      { type: "text", text: horario },
      { type: "text", text: ctx.specialistName },
      { type: "text", text: sala },
      { type: "text", text: direccion },
    ];
  } else {
    bodyParameters = [
      { type: "text", text: nombre },
      { type: "text", text: whatsappConfig.clinicName },
      { type: "text", text: fecha },
      { type: "text", text: horario },
      { type: "text", text: ctx.specialistName },
      { type: "text", text: sala },
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
