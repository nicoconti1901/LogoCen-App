import type { Request, Response } from "express";
import { z } from "zod";
import * as patientService from "../services/patient.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  documentId: z.string().optional().nullable(),
  birthDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  specialistId: z.string().uuid().optional().nullable(),
});

const updateSchema = createSchema.partial();
const createClinicalHistorySchema = z.object({
  recordDate: z.coerce.date(),
  diagnosis: z.string().min(1),
});
const updateClinicalHistorySchema = createClinicalHistorySchema.partial();

export const list = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const specialistId = typeof req.query.specialistId === "string" ? req.query.specialistId : undefined;
  const rows = await patientService.listPatients({ search, specialistId });
  res.json(rows);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const row = await patientService.getPatientById(String(req.params.id));
  res.json(row);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await patientService.createPatient(body);
  res.status(201).json(row);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const row = await patientService.updatePatient(String(req.params.id), body);
  res.json(row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await patientService.deletePatient(String(req.params.id));
  res.status(204).send();
});

export const listClinicalHistory = asyncHandler(async (req: Request, res: Response) => {
  const rows = await patientService.listClinicalHistory(String(req.params.id));
  res.json(rows);
});

export const createClinicalHistory = asyncHandler(async (req: Request, res: Response) => {
  const body = createClinicalHistorySchema.parse(req.body);
  const row = await patientService.createClinicalHistoryEntry(
    String(req.params.id),
    {
      recordDate: body.recordDate,
      diagnosis: body.diagnosis,
    },
    {
      role: req.user!.role,
      specialistId: req.user!.specialistId,
    }
  );
  res.status(201).json(row);
});

export const updateClinicalHistory = asyncHandler(async (req: Request, res: Response) => {
  const body = updateClinicalHistorySchema.parse(req.body);
  const row = await patientService.updateClinicalHistoryEntry(
    String(req.params.id),
    String(req.params.entryId),
    {
      ...(body.recordDate !== undefined ? { recordDate: body.recordDate } : {}),
      ...(body.diagnosis !== undefined ? { diagnosis: body.diagnosis } : {}),
    },
    {
      role: req.user!.role,
      specialistId: req.user!.specialistId,
    },
  );
  res.json(row);
});

export const removeClinicalHistory = asyncHandler(async (req: Request, res: Response) => {
  await patientService.deleteClinicalHistoryEntry(
    String(req.params.id),
    String(req.params.entryId),
    {
      role: req.user!.role,
      specialistId: req.user!.specialistId,
    },
  );
  res.status(204).send();
});
