import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { AppError } from "./errorHandler.js";
import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new AppError(401, "No autorizado"));
    return;
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError(401, "Token inválido o expirado"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "No autorizado"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "Sin permisos"));
      return;
    }
    next();
  };
}
