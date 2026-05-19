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

  const intro =
    ctx.kind === WhatsappReminderKind.SHORT_NOTICE
      ? `Hola ${nombre}, tu turno en *${lugar}* es en menos de 24 horas. Necesitamos que confirmes si vas a asistir.`
      : `Hola ${nombre}, te recordamos tu turno en *${lugar}*:`;

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
  ].join("\n");
}

/** ID del botón interactivo (Meta, máx. 256 caracteres). */
export function buildConfirmButtonId(appointmentRef: string): string {
  const safe = appointmentRef.replace(/:/g, "_");
  return `${whatsappConfig.confirmButtonIdPrefix}_${safe}`;
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
