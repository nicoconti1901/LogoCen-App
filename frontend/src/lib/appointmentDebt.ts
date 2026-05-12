import type { Appointment } from "../types";

function parseMoney(raw: string | null | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Fracción del honorario imputada como deuda por inasistencia (sin considerar `paymentCompleted`). */
function absentDebtFraction(status: Appointment["status"]): number | null {
  if (status === "AUSENTE_CON_AVISO") return 0.5;
  if (status === "AUSENTE_SIN_AVISO") return 1;
  return null;
}

/**
 * Para turnos RESERVADO: saldo del honorario no cubierto por la seña.
 * `null` si no se puede calcular (p. ej. sin honorario cargado).
 */
export function reservadoHonorarioRemainder(a: Appointment): number | null {
  if (a.status !== "RESERVADO") return null;
  const fee = parseMoney(a.specialist.consultationFee);
  const dep = parseMoney(a.reservationDepositAmount ?? "");
  if (!(fee > 0) || !(dep > 0)) return null;
  return Math.max(0, fee - dep);
}

/**
 * Deuda del turno para listados / badges.
 * Ausencias: 50% o 100% del honorario según estado (salvo `paymentCompleted`).
 * RESERVADO: la seña cargada se considera abonada; con "Pago realizado = No" solo hay deuda si queda saldo del honorario.
 */
export function appointmentHasDebt(a: Appointment): boolean {
  if (a.paymentCompleted) return false;
  const abs = absentDebtFraction(a.status);
  if (abs != null) {
    const fee = parseMoney(a.specialist.consultationFee);
    if (fee > 0) return fee * abs > 0;
    return true;
  }
  if (a.status === "RESERVADO") {
    const remainder = reservadoHonorarioRemainder(a);
    if (remainder != null) return remainder > 0;
    return a.paymentMethod === null;
  }
  return a.paymentMethod === null;
}

/** Honorario de referencia del especialista en el turno. */
export function appointmentReferenciaHonorarioArs(a: Appointment): number {
  return parseMoney(a.specialist.consultationFee);
}

/**
 * Monto ya considerado abonado: honorario completo si `paymentCompleted`, o la seña imputada en Reservado.
 */
export function appointmentImputadoPagadoArs(a: Appointment): number {
  if (a.paymentCompleted) {
    return parseMoney(a.specialist.consultationFee);
  }
  if (a.status === "RESERVADO") {
    return parseMoney(a.reservationDepositAmount ?? "");
  }
  return 0;
}

/** Monto a sumar como deuda del paciente (saldo pendiente o honorario completo / fracción por ausencia). */
export function appointmentDebtAmountArs(a: Appointment): number {
  if (!appointmentHasDebt(a)) return 0;
  const abs = absentDebtFraction(a.status);
  if (abs != null) {
    const fee = parseMoney(a.specialist.consultationFee);
    if (fee <= 0) return 0;
    return Math.round(fee * abs * 100) / 100;
  }
  const remainder = reservadoHonorarioRemainder(a);
  if (remainder != null) return remainder;
  return parseMoney(a.specialist.consultationFee);
}
