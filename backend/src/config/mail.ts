import nodemailer from "nodemailer";
import { env, isMailConfigured } from "./env.js";

let transporter: nodemailer.Transporter | null = null;

export function getMailTransporter(): nodemailer.Transporter | null {
  if (!isMailConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE === "true",
    auth:
      env.SMTP_USER !== undefined && env.SMTP_USER !== ""
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" }
        : undefined,
  });
  return transporter;
}
