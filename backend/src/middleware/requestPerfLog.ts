import type { NextFunction, Request, Response } from "express";
import { logHttpPerf } from "../utils/perfLog.js";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Registra duración de escrituras en agenda (visible en logs de Render). */
export function appointmentWritePerfLog(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) {
    next();
    return;
  }

  const start = performance.now();
  res.on("finish", () => {
    logHttpPerf({
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(performance.now() - start),
    });
  });
  next();
}
