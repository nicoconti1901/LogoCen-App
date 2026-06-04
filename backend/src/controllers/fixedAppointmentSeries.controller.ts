import { AppointmentPaymentMethod, AppointmentStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import * as fixedAppointmentSeriesService from "../services/fixedAppointmentSeries.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { enrichAppointment } from "../utils/datetime.js";
import { parseFixedAppointmentId } from "../utils/fixedAppointmentOccurrences.js";
import { parseDateOnlyISO } from "../utils/appointmentTime.js";
import {
  MEDICAL_RECORD_MAX,
  REASON_MAX,
  dateOnlyStringSchema,
  optionalDateOnlyStringSchema,
  optionalLongTextSchema,
  optionalMoneySchema,
  timeSchema,
} from "../utils/fieldValidation.js";
import { paymentSplitsInputSchema } from "../utils/paymentSplitsSchema.js";

const createSchema = z.object({
  patientId: z.string().uuid(),
  specialistId: z.string().uuid(),
  consultorio: z.string().min(1),
  date: dateOnlyStringSchema,
  startTime: timeSchema,
  displayDurationMinutes: z.number().int().min(15).max(240).optional(),
  effectiveUntil: optionalDateOnlyStringSchema,
  reasonForVisit: optionalLongTextSchema(REASON_MAX),
});

const skipSchema = z.object({
  date: dateOnlyStringSchema,
});

const occurrenceUpdateSchema = z
  .object({
    date: dateOnlyStringSchema,
    status: z.nativeEnum(AppointmentStatus).optional(),
    paymentMethod: z.nativeEnum(AppointmentPaymentMethod).optional().nullable(),
    paymentSplits: paymentSplitsInputSchema,
    paymentCompleted: z.boolean().optional(),
    paymentDate: optionalDateOnlyStringSchema,
    specialistSettledAt: z.coerce.date().optional().nullable(),
    medicalRecord: optionalLongTextSchema(MEDICAL_RECORD_MAX),
    reasonForVisit: optionalLongTextSchema(REASON_MAX),
    reservationDepositAmount: optionalMoneySchema,
  })
  .superRefine((body, ctx) => {
    if (body.paymentCompleted && !body.paymentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indique la fecha de pago",
        path: ["paymentDate"],
      });
    }
  });

function enrichFixedRow(a: Awaited<ReturnType<typeof fixedAppointmentSeriesService.upsertFixedAppointmentOccurrence>>) {
  const base = enrichAppointment(a);
  const parsed = parseFixedAppointmentId(a.id);
  return {
    ...base,
    isFixedSeries: true,
    fixedSeriesId: parsed?.seriesId ?? null,
  };
}

function ctx(req: Request) {
  return {
    role: req.user!.role,
    userSpecialistId: req.user!.specialistId,
  };
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await fixedAppointmentSeriesService.createFixedAppointmentSeries(body, ctx(req).role, ctx(req).userSpecialistId);
  res.status(201).json(row);
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const row = await fixedAppointmentSeriesService.cancelFixedAppointmentSeries(
    String(req.params.seriesId),
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(row);
});

export const skipOccurrence = asyncHandler(async (req: Request, res: Response) => {
  const body = skipSchema.parse(req.body);
  const result = await fixedAppointmentSeriesService.skipFixedAppointmentOccurrence(
    String(req.params.seriesId),
    body.date,
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(result);
});

export const upsertOccurrence = asyncHandler(async (req: Request, res: Response) => {
  const body = occurrenceUpdateSchema.parse(req.body);
  const row = await fixedAppointmentSeriesService.upsertFixedAppointmentOccurrence(
    String(req.params.seriesId),
    body.date,
    {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
      ...(body.paymentSplits !== undefined ? { paymentSplits: body.paymentSplits } : {}),
      ...(body.paymentCompleted !== undefined ? { paymentCompleted: body.paymentCompleted } : {}),
      ...(body.paymentDate !== undefined
        ? { paymentDate: body.paymentDate ? parseDateOnlyISO(body.paymentDate) : null }
        : {}),
      ...(body.specialistSettledAt !== undefined ? { specialistSettledAt: body.specialistSettledAt } : {}),
      ...(body.medicalRecord !== undefined ? { medicalRecord: body.medicalRecord } : {}),
      ...(body.reasonForVisit !== undefined ? { reasonForVisit: body.reasonForVisit } : {}),
      ...(body.reservationDepositAmount !== undefined
        ? { reservationDepositAmount: body.reservationDepositAmount }
        : {}),
    },
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(enrichFixedRow(row));
});

export const listByPatient = asyncHandler(async (req: Request, res: Response) => {
  const patientId = String(req.query.patientId ?? "");
  if (!patientId) {
    res.json([]);
    return;
  }
  const specialistId = typeof req.query.specialistId === "string" ? req.query.specialistId : undefined;
  const rows = await fixedAppointmentSeriesService.listActiveFixedSeriesForPatient(patientId, specialistId);
  res.json(rows);
});
