import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Request } from "express";
import { specialistDocumentRepository } from "../repositories/specialistDocument.repository.js";
import { specialistRepository } from "../repositories/specialist.repository.js";
import { AppError } from "../middleware/errorHandler.js";

function uploadsAbsolute(storagePath: string): string {
  return path.resolve(process.cwd(), "uploads", storagePath);
}

function documentUrls(req: Request, storagePath: string) {
  const relativeUrl = `/uploads/${storagePath.replace(/\\/g, "/")}`;
  const origin = `${req.protocol}://${req.get("host") ?? ""}`;
  return { relativeUrl, fileUrl: `${origin}${relativeUrl}` };
}

export async function listSpecialistDocuments(specialistId: string, req: Request) {
  const specialist = await specialistRepository.findById(specialistId);
  if (!specialist) throw new AppError(404, "Especialista no encontrado");

  const rows = await specialistDocumentRepository.findBySpecialistId(specialistId);
  return rows.map((row) => ({
    id: row.id,
    specialistId: row.specialistId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    createdAt: row.createdAt,
    ...documentUrls(req, row.storagePath),
  }));
}

export async function uploadSpecialistDocument(
  specialistId: string,
  req: Request,
  file: Express.Multer.File
) {
  const specialist = await specialistRepository.findById(specialistId);
  if (!specialist) throw new AppError(404, "Especialista no encontrado");

  const storagePath = path.posix.join("specialist-documents", specialistId, file.filename);
  const row = await specialistDocumentRepository.create({
    specialistId,
    fileName: file.originalname.trim() || file.filename,
    mimeType: file.mimetype,
    storagePath,
    fileSize: file.size,
  });

  return {
    id: row.id,
    specialistId: row.specialistId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    createdAt: row.createdAt,
    ...documentUrls(req, row.storagePath),
  };
}

export async function deleteSpecialistDocument(specialistId: string, documentId: string) {
  const row = await specialistDocumentRepository.findById(documentId);
  if (!row || row.specialistId !== specialistId) {
    throw new AppError(404, "Documento no encontrado");
  }

  await specialistDocumentRepository.delete(documentId);

  try {
    await unlink(uploadsAbsolute(row.storagePath));
  } catch {
    // El archivo puede no existir en disco; la fila ya se eliminó.
  }
}
