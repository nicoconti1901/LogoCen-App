import type { AppointmentPaymentMethod, AppointmentPaymentSplit } from "../types";

export const PAYMENT_METHOD_LABELS: Record<AppointmentPaymentMethod, string> = {
  TRANSFER_TO_LOGOCEN: "Transferencia a LogoCen",
  TRANSFER_TO_SPECIALIST: "Transferencia al especialista",
  CASH_TO_LOGOCEN: "Efectivo a LogoCen",
};

/** Etiquetas cortas para tablas. */
export const PAYMENT_METHOD_TABLE_LABELS: Record<AppointmentPaymentMethod, string> = {
  TRANSFER_TO_LOGOCEN: "Transf. LogoCen",
  TRANSFER_TO_SPECIALIST: "Transf. especialista",
  CASH_TO_LOGOCEN: "Efectivo LogoCen",
};

export function formatArsShort(amount: string): string {
  const n = Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(n);
}

export function hasCombinedPayment(splits: AppointmentPaymentSplit[] | null | undefined): boolean {
  return Boolean(splits && splits.length >= 2);
}

export function formatAppointmentPaymentLabel(
  paymentMethod: AppointmentPaymentMethod | null,
  paymentSplits: AppointmentPaymentSplit[] | null | undefined
): string {
  if (hasCombinedPayment(paymentSplits)) {
    return paymentSplits!
      .map((s) => `${PAYMENT_METHOD_LABELS[s.method]} ${formatArsShort(s.amount)}`)
      .join(" + ");
  }
  if (paymentMethod) return PAYMENT_METHOD_LABELS[paymentMethod];
  return "sin definir";
}

export function formatAppointmentPaymentTableLabel(
  paymentMethod: AppointmentPaymentMethod | null,
  paymentSplits: AppointmentPaymentSplit[] | null | undefined
): string {
  if (hasCombinedPayment(paymentSplits)) {
    return paymentSplits!
      .map((s) => `${PAYMENT_METHOD_TABLE_LABELS[s.method]} ${formatArsShort(s.amount)}`)
      .join(" + ");
  }
  if (paymentMethod) return PAYMENT_METHOD_TABLE_LABELS[paymentMethod];
  return "Sin definir";
}

export function appointmentHasTransferToSpecialist(
  paymentMethod: AppointmentPaymentMethod | null,
  paymentSplits: AppointmentPaymentSplit[] | null | undefined
): boolean {
  if (hasCombinedPayment(paymentSplits)) {
    return paymentSplits!.some((s) => s.method === "TRANSFER_TO_SPECIALIST");
  }
  return paymentMethod === "TRANSFER_TO_SPECIALIST";
}

/** Monto por método para balance (usa honorario completo si no hay splits). */
export function amountsByPaymentMethod(
  paymentMethod: AppointmentPaymentMethod | null,
  paymentSplits: AppointmentPaymentSplit[] | null | undefined,
  fallbackHonorario: number
): Partial<Record<AppointmentPaymentMethod, number>> {
  if (hasCombinedPayment(paymentSplits)) {
    const out: Partial<Record<AppointmentPaymentMethod, number>> = {};
    for (const s of paymentSplits!) {
      const n = Number(String(s.amount).replace(",", "."));
      if (!Number.isFinite(n)) continue;
      out[s.method] = (out[s.method] ?? 0) + n;
    }
    return out;
  }
  if (paymentMethod && fallbackHonorario > 0) {
    return { [paymentMethod]: fallbackHonorario };
  }
  return {};
}
