import { AppointmentPaymentMethod } from "@prisma/client";
import { z } from "zod";
export const paymentSplitInputSchema = z.object({
  method: z.nativeEnum(AppointmentPaymentMethod),
  amount: z.union([z.string(), z.number()]),
});

export const paymentSplitsInputSchema = z.array(paymentSplitInputSchema).max(8).optional().nullable();
