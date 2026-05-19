import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { whatsappConfig } from "../config/whatsapp.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorHandler.js";
import { processDueWhatsappReminders } from "../services/whatsappReminder.service.js";
import {
  handleMetaWebhookPayload,
  verifyMetaWebhookSignature,
} from "../services/whatsappWebhook.service.js";

export const metaWebhookVerify = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === whatsappConfig.verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
};

export const metaWebhookReceive = asyncHandler(async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    res.sendStatus(400);
    return;
  }

  const signature = req.header("x-hub-signature-256");
  if (whatsappConfig.appSecret && !verifyMetaWebhookSignature(rawBody, signature)) {
    res.sendStatus(403);
    return;
  }

  const payload = JSON.parse(rawBody.toString("utf8")) as Parameters<typeof handleMetaWebhookPayload>[0];
  await handleMetaWebhookPayload(payload);
  res.sendStatus(200);
});

export const runRemindersCron = asyncHandler(async (req: Request, res: Response) => {
  if (!env.CRON_SECRET) {
    throw new AppError(503, "CRON_SECRET no configurado");
  }
  const secret = req.header("x-cron-secret");
  if (secret !== env.CRON_SECRET) {
    throw new AppError(401, "No autorizado");
  }
  const result = await processDueWhatsappReminders();
  res.json(result);
});
