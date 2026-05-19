import type { Request, Response } from "express";
import * as specialistDocumentService from "../services/specialistDocument.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const specialistId = String(req.params.id);
  const rows = await specialistDocumentService.listSpecialistDocuments(specialistId, req);
  res.json(rows);
});

export const upload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(400, "Debes seleccionar un archivo");
  }
  const specialistId = String(req.params.id);
  const row = await specialistDocumentService.uploadSpecialistDocument(specialistId, req, req.file);
  res.status(201).json(row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const specialistId = String(req.params.id);
  const documentId = String(req.params.documentId);
  await specialistDocumentService.deleteSpecialistDocument(specialistId, documentId);
  res.status(204).send();
});
