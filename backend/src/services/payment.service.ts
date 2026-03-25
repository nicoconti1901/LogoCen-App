import { PaymentStatus, Prisma, Role } from "@prisma/client";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { AppError } from "../middleware/errorHandler.js";

function assertAppointmentAccess(
  role: Role,
  userSpecialistId: string | null,
  appointmentSpecialistId: string
): void {
  if (role === Role.ADMIN) return;
  if (role === Role.SPECIALIST && userSpecialistId === appointmentSpecialistId) return;
  throw new AppError(403, "Sin permisos sobre esta cita");
}

export async function listPayments(params: {
  role: Role;
  userSpecialistId: string | null;
  appointmentId?: string;
  status?: PaymentStatus;
}) {
  const where: Prisma.PaymentWhereInput = {};
  if (params.status) where.status = params.status;
  if (params.appointmentId) where.appointmentId = params.appointmentId;

  if (params.role === Role.SPECIALIST) {
    if (!params.userSpecialistId) throw new AppError(403, "Sin perfil de especialista");
    where.appointment = { specialistId: params.userSpecialistId };
  }

  return paymentRepository.findMany(where);
}

export async function getPaymentById(
  id: string,
  role: Role,
  userSpecialistId: string | null
) {
  const p = await paymentRepository.findById(id);
  if (!p) throw new AppError(404, "Pago no encontrado");
  assertAppointmentAccess(role, userSpecialistId, p.appointment.specialistId);
  return p;
}

export async function createPayment(
  data: {
    appointmentId: string;
    amount: string | number | Prisma.Decimal;
    currency?: string;
    status?: PaymentStatus;
    method?: string | null;
    paidAt?: Date | null;
    notes?: string | null;
  },
  role: Role,
  userSpecialistId: string | null
) {
  const appt = await appointmentRepository.findById(data.appointmentId);
  if (!appt) throw new AppError(404, "Cita no encontrada");
  assertAppointmentAccess(role, userSpecialistId, appt.specialistId);

  return paymentRepository.create({
    appointment: { connect: { id: data.appointmentId } },
    amount: data.amount,
    currency: data.currency ?? "ARS",
    ...(data.status !== undefined ? { status: data.status } : {}),
    method: data.method?.trim() || null,
    paidAt: data.paidAt ?? null,
    notes: data.notes?.trim() || null,
  });
}

export async function updatePayment(
  id: string,
  data: Partial<{
    amount: string | number | Prisma.Decimal;
    currency: string;
    status: PaymentStatus;
    method: string | null;
    paidAt: Date | null;
    notes: string | null;
  }>,
  role: Role,
  userSpecialistId: string | null
) {
  const existing = await paymentRepository.findById(id);
  if (!existing) throw new AppError(404, "Pago no encontrado");
  assertAppointmentAccess(role, userSpecialistId, existing.appointment.specialistId);

  return paymentRepository.update(id, {
    ...(data.amount !== undefined ? { amount: data.amount } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.method !== undefined ? { method: data.method?.trim() || null } : {}),
    ...(data.paidAt !== undefined ? { paidAt: data.paidAt } : {}),
    ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
  });
}

export async function deletePayment(id: string, role: Role, userSpecialistId: string | null) {
  const existing = await paymentRepository.findById(id);
  if (!existing) throw new AppError(404, "Pago no encontrado");
  assertAppointmentAccess(role, userSpecialistId, existing.appointment.specialistId);
  await paymentRepository.delete(id);
}
