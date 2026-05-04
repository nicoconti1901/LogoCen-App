import { Role, Weekday } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import * as specialistService from "../services/specialist.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** URLs largas (p. ej. Drive con query) o data URLs superaban 2048 y rompían el POST. */
const optionalUrl = z.union([z.string().max(32_000), z.literal(""), z.null()]).optional();
const strongPassword = z
  .string()
  .min(8)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, "La contraseña debe tener mayúscula, minúscula, número y símbolo");
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:mm (24 h)");
const optionalMoney = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/), z.literal(""), z.null()]).optional();
const optionalAlias = z.union([z.string().max(120), z.literal(""), z.null()]).optional();
const availabilitySchema = z.object({
  weekday: z.nativeEnum(Weekday),
  startTime: timeSchema,
  endTime: timeSchema,
});

const createSchema = z.object({
  email: z.string().email(),
  password: strongPassword,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  specialty: z.string().min(1),
  profilePhotoUrl: optionalUrl,
  licenseNumber: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
  consultationFee: optionalMoney,
  transferAlias: optionalAlias,
  availabilities: z.array(availabilitySchema).optional(),
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: strongPassword.optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  profilePhotoUrl: optionalUrl,
  licenseNumber: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
  consultationFee: optionalMoney,
  transferAlias: optionalAlias,
  availabilities: z.array(availabilitySchema).optional(),
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
  const id = String(req.params.id);
  if (req.user?.role === Role.SPECIALIST && req.user.specialistId !== id) {
    throw new AppError(403, "Sin permisos");
  }
  const body = updateSchema.parse(req.body);
  if (req.user?.role === Role.SPECIALIST && "active" in body) {
    delete (body as { active?: boolean }).active;
  }
  const row = await specialistService.updateSpecialist(id, body);
  res.json(row);
});

export const uploadProfilePhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(400, "Debes seleccionar una imagen");
  }
  const relativeUrl = `/uploads/specialists/${req.file.filename}`;
  const origin = `${req.protocol}://${req.get("host") ?? ""}`;
  res.status(201).json({
    url: `${origin}${relativeUrl}`,
    relativeUrl,
  });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await specialistService.deleteSpecialist(String(req.params.id));
  res.status(204).send();
});
