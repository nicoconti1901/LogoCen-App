import { Role } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import type { SpecialistWithUser } from "../repositories/specialist.repository.js";
import * as specialistService from "../services/specialist.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  CONSIDERATIONS_MAX,
  availabilitySchema,
  emailSchema,
  optionalLicenseSchema,
  optionalLongTextSchema,
  optionalMoneySchema,
  optionalPhoneSchema,
  optionalTransferAliasSchema,
  personNameSchema,
  strongPasswordSchema,
} from "../utils/fieldValidation.js";

function serializeSpecialist(row: SpecialistWithUser, req?: Request) {
  const { _count, user, ...rest } = row;
  const isAdmin = req?.user?.role === Role.ADMIN;
  return {
    ...rest,
    user: { id: user.id, email: user.email },
    ...(isAdmin ? { visiblePassword: user.adminVisiblePassword ?? null } : {}),
    documentCount: _count?.documents ?? 0,
  };
}

/** URLs largas (p. ej. Drive con query) o data URLs superaban 2048 y rompían el POST. */
const optionalUrl = z.union([z.string().max(32_000), z.literal(""), z.null()]).optional();

const createSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  specialty: z.string().trim().min(2, "Especialidad: mínimo 2 caracteres").max(120),
  profilePhotoUrl: optionalUrl,
  licenseNumber: optionalLicenseSchema,
  phone: optionalPhoneSchema,
  consultationFee: optionalMoneySchema,
  monthlyConsultorioRent: optionalMoneySchema,
  transferAlias: optionalTransferAliasSchema,
  considerations: optionalLongTextSchema(CONSIDERATIONS_MAX),
  availabilities: z.array(availabilitySchema).optional(),
});

const updateSchema = z.object({
  email: emailSchema.optional(),
  password: strongPasswordSchema.optional(),
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  specialty: z.string().trim().min(2).max(120).optional(),
  profilePhotoUrl: optionalUrl,
  licenseNumber: optionalLicenseSchema,
  phone: optionalPhoneSchema,
  consultationFee: optionalMoneySchema,
  monthlyConsultorioRent: optionalMoneySchema,
  transferAlias: optionalTransferAliasSchema,
  considerations: optionalLongTextSchema(CONSIDERATIONS_MAX),
  availabilities: z.array(availabilitySchema).optional(),
  active: z.boolean().optional(),
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const includeInactive = req.query.includeInactive === "true";
  const rows = await specialistService.listSpecialists(includeInactive);
  res.json(rows.map((row) => serializeSpecialist(row, req)));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (req.user?.role === Role.SPECIALIST && req.user.specialistId !== id) {
    throw new AppError(403, "Sin permisos");
  }
  const row = await specialistService.getSpecialistById(id);
  res.json(serializeSpecialist(row, req));
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== Role.SPECIALIST || !req.user.specialistId) {
    throw new AppError(403, "Solo especialistas");
  }
  const row = await specialistService.getSpecialistById(req.user.specialistId);
  res.json(serializeSpecialist(row, req));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await specialistService.createSpecialist(body);
  res.status(201).json(serializeSpecialist(row, req));
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
  if (req.user?.role === Role.SPECIALIST && "monthlyConsultorioRent" in body) {
    delete (body as { monthlyConsultorioRent?: unknown }).monthlyConsultorioRent;
  }
  if (req.user?.role === Role.SPECIALIST && "considerations" in body) {
    delete (body as { considerations?: unknown }).considerations;
  }
  if (req.user?.role === Role.SPECIALIST) {
    delete (body as { password?: string }).password;
  }
  const row = await specialistService.updateSpecialist(id, body);
  res.json(serializeSpecialist(row, req));
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

export const registerVisiblePassword = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = z
    .object({
      password: z.string().min(1, "Ingresá la contraseña del especialista"),
    })
    .parse(req.body);
  const row = await specialistService.registerAdminVisiblePassword(id, body.password);
  res.json(serializeSpecialist(row, req));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await specialistService.deleteSpecialist(String(req.params.id));
  res.status(204).send();
});
