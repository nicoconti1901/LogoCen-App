import { AppointmentPaymentMethod, AppointmentStatus, Role } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import * as appointmentService from "../services/appointment.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parseDateOnlyISO } from "../utils/appointmentTime.js";
import { enrichAppointment } from "../utils/datetime.js";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:mm (24 h)");

const createSchema = z.object({
  patientId: z.string().uuid(),
  specialistId: z.string().uuid(),
  consultorio: z.string().min(1),
  date: z.string().min(1),
  startTime: timeSchema,
  endTime: timeSchema,
  status: z.nativeEnum(AppointmentStatus).optional(),
  paymentMethod: z.nativeEnum(AppointmentPaymentMethod).optional().nullable(),
  medicalRecord: z.string().optional().nullable(),
  reasonForVisit: z.string().optional().nullable(),
});

const updateSchema = z.object({
  patientId: z.string().uuid().optional(),
  specialistId: z.string().uuid().optional(),
  consultorio: z.string().min(1).optional(),
  date: z.string().optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  paymentMethod: z.nativeEnum(AppointmentPaymentMethod).optional().nullable(),
  medicalRecord: z.string().optional().nullable(),
  reasonForVisit: z.string().optional().nullable(),
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

  const fromStr = q.from ? String(q.from).slice(0, 10) : undefined;
  const toStr = q.to ? String(q.to).slice(0, 10) : undefined;

  const rows = await appointmentService.listAppointments({
    ...ctx(req),
    from: fromStr ? parseDateOnlyISO(fromStr) : undefined,
    to: toStr ? parseDateOnlyISO(toStr) : undefined,
    today: q.today === "true",
    upcoming: q.upcoming === "true",
    status,
    specialistId: req.user!.role === Role.ADMIN ? specialistId : undefined,
    patientId,
  });
  res.json(rows.map((a) => enrichAppointment(a)));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const row = await appointmentService.getAppointmentById(
    String(req.params.id),
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(enrichAppointment(row));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await appointmentService.createAppointment(
    {
      patientId: body.patientId,
      specialistId: body.specialistId,
      consultorio: body.consultorio,
      appointmentDate: parseDateOnlyISO(body.date),
      startTime: body.startTime,
      endTime: body.endTime,
      status: body.status,
      paymentMethod: body.paymentMethod,
      medicalRecord: body.medicalRecord,
      reasonForVisit: body.reasonForVisit,
    },
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.status(201).json(enrichAppointment(row));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const row = await appointmentService.updateAppointment(
    String(req.params.id),
    {
      ...(body.patientId !== undefined ? { patientId: body.patientId } : {}),
      ...(body.specialistId !== undefined ? { specialistId: body.specialistId } : {}),
      ...(body.consultorio !== undefined ? { consultorio: body.consultorio } : {}),
      ...(body.date !== undefined ? { appointmentDate: parseDateOnlyISO(body.date) } : {}),
      ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
      ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
      ...(body.medicalRecord !== undefined ? { medicalRecord: body.medicalRecord } : {}),
      ...(body.reasonForVisit !== undefined ? { reasonForVisit: body.reasonForVisit } : {}),
    },
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(enrichAppointment(row));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await appointmentService.deleteAppointment(String(req.params.id), ctx(req).role, ctx(req).userSpecialistId);
  res.status(204).send();
});
