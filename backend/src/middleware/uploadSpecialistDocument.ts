import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";

const DOCUMENT_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "specialist-documents");

mkdirSync(DOCUMENT_UPLOAD_ROOT, { recursive: true });

const MIME_EXTENSION: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const ALLOWED_MIME_TYPES = new Set(Object.keys(MIME_EXTENSION));

const storage = multer.diskStorage({
  destination: (req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const specialistId = String(req.params.id);
    const dir = path.join(DOCUMENT_UPLOAD_ROOT, specialistId);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const ext = MIME_EXTENSION[file.mimetype] ?? (path.extname(file.originalname) || ".bin");
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const documentUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, "Formato no soportado (PDF, Word o imagen jpg/png/webp/gif)"));
      return;
    }
    cb(null, true);
  },
});

export function uploadSpecialistDocumentMiddleware(req: Request, res: Response, next: NextFunction): void {
  documentUpload.single("document")(req, res, (err?: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new AppError(400, "El archivo no puede superar 15MB"));
      return;
    }
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(400, "No se pudo procesar el archivo"));
  });
}
