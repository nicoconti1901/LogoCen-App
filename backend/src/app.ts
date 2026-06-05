import cors from "cors";
import express from "express";
import path from "node:path";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";
import { whatsappWebhookRouter } from "./routes/whatsapp.webhook.routes.js";

function normalizeCorsOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

function parseCorsOrigins(raw: string): string[] {
  return [...new Set(raw.split(",").map(normalizeCorsOrigin).filter(Boolean))];
}

export function createApp() {
  const app = express();
  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGIN);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, origin);
          return;
        }
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use("/webhooks/whatsapp", whatsappWebhookRouter);
  app.use(express.json());
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", apiRouter);

  app.use(errorHandler);

  return app;
}
