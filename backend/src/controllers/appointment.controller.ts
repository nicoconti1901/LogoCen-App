import { AppointmentStatus, Role } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import * as appointmentService from "../services/appointment.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createSchema = z.object({
  patientId: z.string().uuid(),
  specialistId: z.string().uuid(),
  officeId: z.string().uuid().optional().nullable(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  notes: z.string().optional().nullable(),
  status: z.nativeEnum(AppointmentStatus).optional(),
});

const updateSchema = z.object({
  patientId: z.string().uuid().optional(),
  specialistId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional().nullable(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  notes: z.string().optional().nullable(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  clinicalHistory: z.string().optional().nullable(),
});

function ctx(req: Request) {
  return {
    role: req.user!.role,
    userSpecialistId: req.user!.specialistId,
  };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query;
  const specialistId = typeof q.specialistId === "string" ? q.specialistId : undefined;
  const patientId = typeof q.patientId === "string" ? q.patientId : undefined;
  const status =
    typeof q.status === "string" && q.status in AppointmentStatus
      ? (q.status as AppointmentStatus)
      : undefined;

  const rows = await appointmentService.listAppointments({
    ...ctx(req),
    from: q.from ? new Date(String(q.from)) : undefined,
    to: q.to ? new Date(String(q.to)) : undefined,
    today: q.today === "true",
    upcoming: q.upcoming === "true",
    status,
    specialistId: req.user!.role === Role.ADMIN ? specialistId : undefined,
    patientId,
  });
  res.json(rows);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const row = await appointmentService.getAppointmentById(
    req.params.id,
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(row);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await appointmentService.createAppointment(body, ctx(req).role, ctx(req).userSpecialistId);
  res.status(201).json(row);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const row = await appointmentService.updateAppointment(
    req.params.id,
    body,
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await appointmentService.deleteAppointment(req.params.id, ctx(req).role, ctx(req).userSpecialistId);
  res.status(204).send();
});
