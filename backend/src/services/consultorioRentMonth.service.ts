import { Prisma } from "@prisma/client";
import { consultorioRentMonthRepository } from "../repositories/consultorioRentMonth.repository.js";
import { specialistRepository } from "../repositories/specialist.repository.js";
import { AppError } from "../middleware/errorHandler.js";

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function zeroDecimal(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

export async function ensureConsultorioRentMonthForSpecialist(
  specialistId: string,
  yearMonth: string
): Promise<void> {
  if (!YEAR_MONTH.test(yearMonth)) {
    throw new AppError(400, "Mes inválido (usar YYYY-MM)");
  }

  const existing = await consultorioRentMonthRepository.findBySpecialistAndMonth(specialistId, yearMonth);
  if (existing) return;

  const specialist = await specialistRepository.findById(specialistId);
  if (!specialist) throw new AppError(404, "Especialista no encontrado");

  const prior = await consultorioRentMonthRepository.findLatestStrictlyBefore(specialistId, yearMonth);

  const amount: Prisma.Decimal = prior
    ? new Prisma.Decimal(prior.amount)
    : specialist.monthlyConsultorioRent != null
      ? new Prisma.Decimal(specialist.monthlyConsultorioRent)
      : zeroDecimal();

  try {
    await consultorioRentMonthRepository.create({ specialistId, yearMonth, amount });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return;
    }
    throw e;
  }
}

/** Cuando cambia el alquiler base del especialista, las filas por mes ya creadas seguían con el monto anterior. */
export async function syncStoredRentMonthsToMonthlyTemplate(
  specialistId: string,
  monthlyConsultorioRent: string | number | null
): Promise<void> {
  const amount =
    monthlyConsultorioRent === null || monthlyConsultorioRent === ""
      ? zeroDecimal()
      : new Prisma.Decimal(monthlyConsultorioRent);
  await consultorioRentMonthRepository.updateAllAmountsForSpecialist(specialistId, amount);
}

export async function ensureAndListConsultorioRentMonths(params: {
  yearMonth: string;
  /** ADMIN: todos o filtrados; SPECIALIST: solo este id */
  specialistId?: string | null;
  role: "ADMIN" | "SPECIALIST";
  userSpecialistId: string | null;
}) {
  if (!YEAR_MONTH.test(params.yearMonth)) {
    throw new AppError(400, "Mes inválido (usar YYYY-MM)");
  }

  let specialistIds: string[] | undefined;
  if (params.role === "SPECIALIST") {
    if (!params.userSpecialistId) {
      throw new AppError(403, "Sin especialista asociado");
    }
    specialistIds = [params.userSpecialistId];
  } else if (params.specialistId) {
    specialistIds = [params.specialistId];
  }

  const specialists = await specialistRepository.findMany(true);
  const ids = specialistIds ?? specialists.map((s) => s.id);

  for (const id of ids) {
    await ensureConsultorioRentMonthForSpecialist(id, params.yearMonth);
  }

  const rows = await consultorioRentMonthRepository.findManyForMonth(params.yearMonth, ids);
  let total = new Prisma.Decimal(0);
  for (const r of rows) {
    total = total.plus(new Prisma.Decimal(r.amount));
  }

  return { rows, total: total.toFixed(2) };
}
