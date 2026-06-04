import { AppointmentPaymentMethod, Prisma } from "@prisma/client";
import { AppError } from "../middleware/errorHandler.js";
import { parseMoneyToDecimal } from "../services/appointmentPayment.utils.js";

export type PaymentSplitInput = {
  method: AppointmentPaymentMethod;
  amount: string | number;
};

export type StoredPaymentSplit = {
  method: AppointmentPaymentMethod;
  amount: string;
};

export function parseStoredPaymentSplits(raw: unknown): StoredPaymentSplit[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: StoredPaymentSplit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const method = (item as { method?: unknown }).method;
    const amount = (item as { amount?: unknown }).amount;
    if (
      typeof method !== "string" ||
      !Object.values(AppointmentPaymentMethod).includes(method as AppointmentPaymentMethod)
    ) {
      continue;
    }
    const dec = parseMoneyToDecimal(
      typeof amount === "number" || typeof amount === "string" ? amount : null
    );
    if (!dec || dec.lte(0)) continue;
    out.push({ method: method as AppointmentPaymentMethod, amount: dec.toString() });
  }
  return out.length ? out : null;
}

function validateAndNormalizeSplits(
  splits: PaymentSplitInput[]
): { paymentMethod: AppointmentPaymentMethod | null; paymentSplits: StoredPaymentSplit[] | null } {
  if (splits.length < 2) {
    throw new AppError(400, "El pago combinado requiere al menos dos montos con su forma de pago");
  }
  const normalized: StoredPaymentSplit[] = [];
  for (const row of splits) {
    const dec = parseMoneyToDecimal(row.amount);
    if (!dec || dec.lte(0)) {
      throw new AppError(400, "Cada monto del pago combinado debe ser mayor a cero");
    }
    normalized.push({ method: row.method, amount: dec.toString() });
  }
  return { paymentMethod: null, paymentSplits: normalized };
}

export function normalizeAppointmentPaymentFields(input: {
  paymentMethod?: AppointmentPaymentMethod | null;
  paymentSplits?: PaymentSplitInput[] | null;
}): {
  paymentMethod: AppointmentPaymentMethod | null;
  paymentSplits: Prisma.InputJsonValue | typeof Prisma.DbNull;
} {
  if (input.paymentSplits === null) {
    return {
      paymentMethod: input.paymentMethod ?? null,
      paymentSplits: Prisma.DbNull,
    };
  }

  const splitsInput = input.paymentSplits?.filter((s) => s.method && s.amount !== "") ?? [];

  if (splitsInput.length >= 2) {
    const { paymentMethod, paymentSplits } = validateAndNormalizeSplits(splitsInput);
    return { paymentMethod, paymentSplits: paymentSplits as Prisma.InputJsonValue };
  }

  if (splitsInput.length === 1) {
    return {
      paymentMethod: splitsInput[0].method,
      paymentSplits: Prisma.DbNull,
    };
  }

  if (input.paymentMethod !== undefined) {
    return {
      paymentMethod: input.paymentMethod,
      paymentSplits: Prisma.DbNull,
    };
  }

  return { paymentMethod: null, paymentSplits: Prisma.DbNull };
}

export function serializePaymentSplitsForApi(raw: unknown): StoredPaymentSplit[] | null {
  return parseStoredPaymentSplits(raw);
}
