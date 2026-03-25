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
});

export const env = envSchema.parse(process.env);
