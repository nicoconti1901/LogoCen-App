import type { Request, Response } from "express";
import { z } from "zod";
import * as officeService from "../services/office.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createSchema = z.object({
  name: z.string().min(1),
  number: z.string().optional().nullable(),
});

const updateSchema = createSchema.partial();

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await officeService.listOffices();
  res.json(rows);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const row = await officeService.getOfficeById(req.params.id);
  res.json(row);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await officeService.createOffice(body);
  res.status(201).json(row);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const row = await officeService.updateOffice(req.params.id, body);
  res.json(row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await officeService.deleteOffice(req.params.id);
  res.status(204).send();
});
