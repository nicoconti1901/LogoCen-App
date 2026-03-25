import { PaymentStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import * as paymentService from "../services/payment.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createSchema = z.object({
  appointmentId: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  method: z.string().optional().nullable(),
  paidAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateSchema = z.object({
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  method: z.string().optional().nullable(),
  paidAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function ctx(req: Request) {
  return {
    role: req.user!.role,
    userSpecialistId: req.user!.specialistId,
  };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query;
  const appointmentId = typeof q.appointmentId === "string" ? q.appointmentId : undefined;
  const status =
    typeof q.status === "string" && q.status in PaymentStatus
      ? (q.status as PaymentStatus)
      : undefined;

  const rows = await paymentService.listPayments({
    ...ctx(req),
    appointmentId,
    status,
  });
  res.json(rows);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const row = await paymentService.getPaymentById(
    String(req.params.id),
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(row);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const row = await paymentService.createPayment(body, ctx(req).role, ctx(req).userSpecialistId);
  res.status(201).json(row);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = updateSchema.parse(req.body);
  const row = await paymentService.updatePayment(
    String(req.params.id),
    body,
    ctx(req).role,
    ctx(req).userSpecialistId
  );
  res.json(row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await paymentService.deletePayment(String(req.params.id), ctx(req).role, ctx(req).userSpecialistId);
  res.status(204).send();
});
