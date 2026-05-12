import { AppointmentPaymentMethod, AppointmentStatus, Prisma, Role } from "@prisma/client";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { patientRepository } from "../repositories/patient.repository.js";
import { specialistRepository } from "../repositories/specialist.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  assertValidTime,
  currentTimeHHmm,
  parseDateOnlyISO,
  timeToMinutes,
  timesOverlap,
  toDateOnly,
} from "../utils/appointmentTime.js";
import { endOfLocalDay, startOfLocalDay } from "../utils/date.js";

function parseMoneyToDecimal(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object" && value !== null && "toFixed" in value) {
    return new Prisma.Decimal(value as Prisma.Decimal);
  }
  const s = typeof value === "number" ? String(value) : String(value).trim().replace(",", ".");
  if (!s) return null;
  return new Prisma.Decimal(s);
}

/** Anticipo obligatorio y acotado al honorario cuando el estado es RESERVADO; si no, null. */
function reservationDepositForStatus(
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

function assertCanAccessAppointment(
  role: Role,
  userSpecialistId: string | null,
  appointmentSpecialistId: string
): void {
  if (role === Role.ADMIN) return;
  if (role === Role.SPECIALIST && userSpecialistId === appointmentSpecialistId) return;
  throw new AppError(403, "No puede acceder a esta cita");
}

function assertEndAfterStart(startTime: string, endTime: string): void {
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new AppError(400, "La hora de fin debe ser posterior al inicio");
  }
}

function weekdayFromDate(d: Date): "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" {
  const map = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  return map[d.getDay()];
}

function assertInsideAvailability(
  specialist: Awaited<ReturnType<typeof specialistRepository.findById>>,
  appointmentDate: Date,
  startTime: string,
  endTime: string
): void {
  const availabilities = specialist?.availabilities ?? [];
  if (availabilities.length === 0) {
    throw new AppError(400, "El especialista no tiene disponibilidad configurada");
  }
  const weekday = weekdayFromDate(appointmentDate);
  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  const allowed = availabilities.some((a) => {
    if (a.weekday !== weekday) return false;
    const rangeStart = timeToMinutes(a.startTime);
    const rangeEnd = timeToMinutes(a.endTime);
    return startM >= rangeStart && endM <= rangeEnd;
  });
  if (!allowed) {
    throw new AppError(400, "El especialista no atiende en ese día y horario");
  }
}

async function assertNoOverlap(
  specialistId: string,
  appointmentDate: Date,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<void> {
  const sameDay = await appointmentRepository.findBySpecialistAndDate(
    specialistId,
    appointmentDate,
    excludeId
  );
  for (const row of sameDay) {
    if (timesOverlap(startTime, endTime, row.startTime, row.endTime)) {
      throw new AppError(409, "El especialista ya tiene una cita en ese horario");
    }
  }
}

async function assertNoConsultorioOverlap(
  consultorio: string,
  appointmentDate: Date,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<void> {
  if (!consultorio.trim()) return;
  const sameDay = await appointmentRepository.findByConsultorioAndDate(
    consultorio,
    appointmentDate,
    excludeId
  );
  for (const row of sameDay) {
    if (timesOverlap(startTime, endTime, row.startTime, row.endTime)) {
      throw new AppError(409, "El consultorio ya está ocupado en ese horario");
    }
  }
}

export async function listAppointments(params: {
  role: Role;
  userSpecialistId: string | null;
  from?: Date;
  to?: Date;
  today?: boolean;
  upcoming?: boolean;
  status?: AppointmentStatus;
  specialistId?: string;
  patientId?: string;
}) {
  const todayOnly = toDateOnly(new Date());
  const nowT = currentTimeHHmm();
  await appointmentRepository.markExpiredReservedAsAttended(todayOnly, nowT);

  const where: Prisma.AppointmentWhereInput = {};

  if (params.specialistId) {
    where.specialistId = params.specialistId;
  }

  if (params.patientId) where.patientId = params.patientId;
  if (params.status) where.status = params.status;

  if (params.today && params.upcoming) {
    where.appointmentDate = { equals: todayOnly };
    where.startTime = { gte: nowT };
  } else if (params.today) {
    const s = startOfLocalDay();
    const e = endOfLocalDay();
    where.appointmentDate = { gte: toDateOnly(s), lte: toDateOnly(e) };
  } else {
    const range: Prisma.DateTimeFilter = {};
    if (params.from) range.gte = toDateOnly(params.from);
    if (params.to) range.lte = toDateOnly(params.to);
    if (Object.keys(range).length) where.appointmentDate = range;
  }

  if (params.upcoming && !params.today) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { appointmentDate: { gt: todayOnly } },
          {
            AND: [{ appointmentDate: { equals: todayOnly } }, { startTime: { gte: nowT } }],
          },
        ],
      },
    ];
  }

  return appointmentRepository.findMany(where);
}

export async function getAppointmentById(id: string, role: Role, userSpecialistId: string | null) {
  const todayOnly = toDateOnly(new Date());
  const nowT = currentTimeHHmm();
  await appointmentRepository.markExpiredReservedAsAttended(todayOnly, nowT);
  const a = await appointmentRepository.findById(id);
  if (!a) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, a.specialistId);
  return a;
}

export async function createAppointment(
  data: {
    patientId: string;
    specialistId: string;
    consultorio: string;
    appointmentDate: Date;
    startTime: string;
    endTime: string;
    status?: AppointmentStatus;
    paymentMethod?: AppointmentPaymentMethod | null;
    paymentCompleted?: boolean;
    paymentDate?: Date | null;
    medicalRecord?: string | null;
    reasonForVisit?: string | null;
    reservationDepositAmount?: string | number | null;
  },
  role: Role,
  userSpecialistId: string | null
) {
  if (role === Role.SPECIALIST) {
    if (!userSpecialistId || data.specialistId !== userSpecialistId) {
      throw new AppError(403, "Solo puede crear citas para usted mismo");
    }
  }

  const startTime = assertValidTime(data.startTime);
  const endTime = assertValidTime(data.endTime);
  assertEndAfterStart(startTime, endTime);
  const status = data.status ?? AppointmentStatus.RESERVED;
  const isAusenteConAviso = status === AppointmentStatus.AUSENTE_CON_AVISO;
  const consultorio = isAusenteConAviso ? "" : data.consultorio.trim();
  if (!isAusenteConAviso && !consultorio) throw new AppError(400, "Debe indicar el consultorio");

  const appointmentDate = toDateOnly(data.appointmentDate);

  const specialist = await specialistRepository.findById(data.specialistId);
  if (!specialist || !specialist.active) {
    throw new AppError(400, "Especialista inválido o inactivo");
  }
  assertInsideAvailability(specialist, appointmentDate, startTime, endTime);

  const patient = await patientRepository.findById(data.patientId);
  if (!patient) throw new AppError(400, "Paciente no encontrado");

  await assertNoOverlap(data.specialistId, appointmentDate, startTime, endTime);
  if (consultorio) {
    await assertNoConsultorioOverlap(consultorio, appointmentDate, startTime, endTime);
  }

  const parsedDeposit = parseMoneyToDecimal(data.reservationDepositAmount ?? null);
  const reservationDepositAmount = reservationDepositForStatus(
    status,
    parsedDeposit,
    null,
    specialist.consultationFee
  );

  return appointmentRepository.create({
    patient: { connect: { id: data.patientId } },
    specialist: { connect: { id: data.specialistId } },
    consultorio,
    appointmentDate,
    startTime,
    endTime,
    status,
    reservationDepositAmount,
    paymentMethod: data.paymentMethod ?? null,
    paymentCompleted: data.paymentCompleted ?? false,
    paymentDate: data.paymentCompleted ? (data.paymentDate ?? null) : null,
    medicalRecord: data.medicalRecord?.trim() || null,
    reasonForVisit: data.reasonForVisit?.trim() || null,
  });
}

export async function updateAppointment(
  id: string,
  data: Partial<{
    patientId: string;
    specialistId: string;
    consultorio: string;
    appointmentDate: Date;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    paymentMethod: AppointmentPaymentMethod | null;
    paymentCompleted: boolean;
    paymentDate: Date | null;
    specialistSettledAt: Date | null;
    medicalRecord: string | null;
    reasonForVisit: string | null;
    reservationDepositAmount: string | number | null;
  }>,
  role: Role,
  userSpecialistId: string | null
) {
  const existing = await appointmentRepository.findById(id);
  if (!existing) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, existing.specialistId);

  if (role === Role.SPECIALIST) {
    throw new AppError(403, "Los especialistas no pueden modificar turnos existentes");
  }

  const nextSpecialistId = data.specialistId ?? existing.specialistId;
  const nextStatus = data.status !== undefined ? data.status : existing.status;
  const nextConsultorio =
    nextStatus === AppointmentStatus.AUSENTE_CON_AVISO
      ? ""
      : data.consultorio !== undefined
        ? data.consultorio.trim()
        : existing.consultorio.trim();
  const nextDate = data.appointmentDate !== undefined ? toDateOnly(data.appointmentDate) : existing.appointmentDate;
  const nextStart = data.startTime !== undefined ? assertValidTime(data.startTime) : existing.startTime;
  const nextEnd = data.endTime !== undefined ? assertValidTime(data.endTime) : existing.endTime;
  if (nextStatus !== AppointmentStatus.AUSENTE_CON_AVISO && !nextConsultorio) {
    throw new AppError(400, "Debe indicar el consultorio");
  }

  assertEndAfterStart(nextStart, nextEnd);

  const statusAffectsConsultorio =
    data.status !== undefined &&
    (data.status === AppointmentStatus.AUSENTE_CON_AVISO || existing.status === AppointmentStatus.AUSENTE_CON_AVISO);

  if (
    data.specialistId ||
    data.consultorio !== undefined ||
    data.appointmentDate !== undefined ||
    data.startTime !== undefined ||
    data.endTime !== undefined ||
    statusAffectsConsultorio
  ) {
    const specialist = await specialistRepository.findById(nextSpecialistId);
    if (!specialist || !specialist.active) {
      throw new AppError(400, "Especialista inválido o inactivo");
    }
    assertInsideAvailability(specialist, nextDate, nextStart, nextEnd);
    await assertNoOverlap(nextSpecialistId, nextDate, nextStart, nextEnd, id);
    if (nextConsultorio.trim()) {
      await assertNoConsultorioOverlap(nextConsultorio, nextDate, nextStart, nextEnd, id);
    }
  }

  if (data.patientId) {
    const patient = await patientRepository.findById(data.patientId);
    if (!patient) throw new AppError(400, "Paciente no encontrado");
  }

  const specialistForFee = await specialistRepository.findById(nextSpecialistId);
  const fee = specialistForFee?.consultationFee ?? null;
  const depositFromBody =
    data.reservationDepositAmount !== undefined ? parseMoneyToDecimal(data.reservationDepositAmount) : undefined;
  const rawExistingDeposit = (existing as { reservationDepositAmount?: unknown }).reservationDepositAmount;
  const existingDeposit = parseMoneyToDecimal(
    rawExistingDeposit as string | number | Prisma.Decimal | null | undefined
  );

  const shouldPatchReservationDeposit = data.status !== undefined || data.reservationDepositAmount !== undefined;
  const nextReservationDeposit = shouldPatchReservationDeposit
    ? reservationDepositForStatus(nextStatus, depositFromBody, existingDeposit, fee)
    : undefined;

  return appointmentRepository.update(id, {
    ...(data.patientId !== undefined ? { patient: { connect: { id: data.patientId } } } : {}),
    ...(data.specialistId !== undefined ? { specialist: { connect: { id: data.specialistId } } } : {}),
    ...(data.consultorio !== undefined || data.status !== undefined ? { consultorio: nextConsultorio } : {}),
    ...(data.appointmentDate !== undefined ? { appointmentDate: nextDate } : {}),
    ...(data.startTime !== undefined ? { startTime: nextStart } : {}),
    ...(data.endTime !== undefined ? { endTime: nextEnd } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(nextReservationDeposit !== undefined ? { reservationDepositAmount: nextReservationDeposit } : {}),
    ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
    ...(data.paymentCompleted !== undefined ? { paymentCompleted: data.paymentCompleted } : {}),
    ...((data.paymentDate !== undefined || data.paymentCompleted === false)
      ? {
          paymentDate:
            data.paymentCompleted === false
              ? null
              : data.paymentDate !== undefined
                ? data.paymentDate
                : existing.paymentDate,
        }
      : {}),
    ...(data.specialistSettledAt !== undefined ? { specialistSettledAt: data.specialistSettledAt } : {}),
    ...(data.medicalRecord !== undefined ? { medicalRecord: data.medicalRecord?.trim() || null } : {}),
    ...(data.reasonForVisit !== undefined ? { reasonForVisit: data.reasonForVisit?.trim() || null } : {}),
  });
}

export async function deleteAppointment(id: string, role: Role, userSpecialistId: string | null) {
  const existing = await appointmentRepository.findById(id);
  if (!existing) throw new AppError(404, "Cita no encontrada");
  assertCanAccessAppointment(role, userSpecialistId, existing.specialistId);
  await appointmentRepository.delete(id);
}
