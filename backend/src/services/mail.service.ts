import { env, isMailConfigured } from "../config/env.js";
import { getMailTransporter } from "../config/mail.js";

export type AppointmentMailContext = {
  patientName: string;
  patientEmail: string;
  specialistName: string;
  startAt: Date;
  endAt: Date;
  officeName?: string | null;
  isUpdate?: boolean;
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(d);
}

export async function sendAppointmentConfirmation(
  ctx: AppointmentMailContext
): Promise<void> {
  if (!isMailConfigured()) {
    console.warn("[mail] SMTP no configurado; se omite el envío de correo.");
    return;
  }
  const t = getMailTransporter();
  if (!t || !env.EMAIL_FROM) return;

  const subject = ctx.isUpdate
    ? "Cita reprogramada — confirmación"
    : "Confirmación de cita médica";

  const text = [
    `Estimado/a ${ctx.patientName},`,
    "",
    ctx.isUpdate
      ? "Su cita ha sido actualizada con los siguientes datos:"
      : "Su cita ha sido registrada:",
    "",
    `Especialista: ${ctx.specialistName}`,
    `Inicio: ${formatDate(ctx.startAt)}`,
    `Fin: ${formatDate(ctx.endAt)}`,
    ctx.officeName ? `Consultorio: ${ctx.officeName}` : null,
    "",
    "Si necesita modificar o cancelar, contacte a la clínica.",
    "",
    "Saludos cordiales.",
  ]
    .filter(Boolean)
    .join("\n");

  await t.sendMail({
    from: env.EMAIL_FROM,
    to: ctx.patientEmail,
    subject,
    text,
  });
}
