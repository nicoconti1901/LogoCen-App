import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";

const SPECIALIST_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "specialists");

mkdirSync(SPECIALIST_UPLOAD_DIR, { recursive: true });

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const ALLOWED_MIME_TYPES = new Set(Object.keys(MIME_EXTENSION));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SPECIALIST_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = MIME_EXTENSION[file.mimetype] ?? path.extname(file.originalname) ?? ".bin";
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const specialistPhotoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, "Formato de imagen no soportado (jpg, png, webp, gif)"));
      return;
    }
    cb(null, true);
  },
});

export function uploadSpecialistPhotoMiddleware(req: Request, res: Response, next: NextFunction): void {
  specialistPhotoUpload.single("photo")(req, res, (err?: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new AppError(400, "La imagen no puede superar 5MB"));
      return;
    }
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(400, "No se pudo procesar la imagen"));
  });
}
