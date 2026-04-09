import { Role } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import * as specialistService from "../services/specialist.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** URLs largas (p. ej. Drive con query) o data URLs superaban 2048 y rompían el POST. */
const optionalUrl = z.union([z.string().max(32_000), z.literal(""), z.null()]).optional();

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  specialty: z.string().min(1),
  profilePhotoUrl: optionalUrl,
  licenseNumber: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  profilePhotoUrl: optionalUrl,
  licenseNumber: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
  active: z.boolean().optional(),
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const includeInactive = req.query.includeInactive === "true";
  const rows = await specialistService.listSpecialists(includeInactive);
  res.json(rows);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (req.user?.role === Role.SPECIALIST && req.user.specialistId !== id) {
    throw new AppError(403, "Sin permisos");
  }
  const row = await specialistService.getSpecialistById(id);
  res.json(row);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== Role.SPECIALIST || !req.user.specialistId) {
    throw new AppError(403, "Solo especialistas");
  }
  const row = await specialistService.getSpecialistById(req.user.specialistId);
  res.json(row);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await specialistService.createSpecialist(body);
  res.status(201).json(row);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const row = await specialistService.updateSpecialist(String(req.params.id), body);
  res.json(row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await specialistService.deleteSpecialist(String(req.params.id));
  res.status(204).send();
});
