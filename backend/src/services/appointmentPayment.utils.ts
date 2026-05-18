import { AppointmentStatus, Prisma } from "@prisma/client";
import { AppError } from "../middleware/errorHandler.js";

export function parseMoneyToDecimal(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object" && value !== null && "toFixed" in value) {
    return new Prisma.Decimal(value as Prisma.Decimal);
  }
  const s = typeof value === "number" ? String(value) : String(value).trim().replace(",", ".");
  if (!s) return null;
  return new Prisma.Decimal(s);
}

/** Anticipo obligatorio y acotado al honorario cuando el estado es RESERVADO; si no, null. */
export function reservationDepositForStatus(
  status: AppointmentStatus,
  amountInput: Prisma.Decimal | null | undefined,
  existingAmount: Prisma.Decimal | null | undefined,
  consultationFee: Prisma.Decimal | null | undefined
): Prisma.Decimal | null {
  if (status !== AppointmentStatus.RESERVADO) return null;
  const amount = amountInput ?? existingAmount ?? null;
  if (amount === null || amount === undefined) {
    throw new AppError(400, "Debe indicar el monto del anticipo para el estado Reservado");
  }
  if (amount.lte(0)) {
    throw new AppError(400, "El anticipo debe ser mayor a cero");
  }
  if (consultationFee != null && amount.gt(consultationFee)) {
    throw new AppError(400, "El anticipo no puede superar el honorario de la consulta");
  }
  return amount;
}
