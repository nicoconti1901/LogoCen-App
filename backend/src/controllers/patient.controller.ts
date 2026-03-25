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
});

const updateSchema = createSchema.partial();

export const list = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const rows = await patientService.listPatients(search);
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
