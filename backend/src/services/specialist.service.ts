import { Role } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../middleware/errorHandler.js";
import { hashPassword } from "../utils/password.js";

export async function listSpecialists(includeInactive = false) {
  return prisma.specialist.findMany({
    where: includeInactive ? {} : { active: true },
    include: {
      user: { select: { id: true, email: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function getSpecialistById(id: string) {
  const s = await prisma.specialist.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!s) throw new AppError(404, "Especialista no encontrado");
  return s;
}

export async function createSpecialist(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  specialty: string;
  licenseNumber?: string | null;
  phone?: string | null;
}) {
  const email = data.email.toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new AppError(409, "El correo ya está registrado");

  const passwordHash = await hashPassword(data.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: Role.ESPECIALISTA,
      },
    });
    const specialist = await tx.specialist.create({
      data: {
        userId: user.id,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        specialty: data.specialty.trim(),
        licenseNumber: data.licenseNumber?.trim() || null,
        phone: data.phone?.trim() || null,
      },
      include: { user: { select: { id: true, email: true } } },
    });
    return specialist;
  });
}

export async function updateSpecialist(
  id: string,
  data: Partial<{
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    specialty: string;
    licenseNumber: string | null;
    phone: string | null;
    active: boolean;
  }>
) {
  const specialist = await prisma.specialist.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!specialist) throw new AppError(404, "Especialista no encontrado");

  if (data.email && data.email.toLowerCase().trim() !== specialist.user.email) {
    const taken = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });
    if (taken) throw new AppError(409, "El correo ya está en uso");
  }

  let passwordHash: string | undefined;
  if (data.password) {
    passwordHash = await hashPassword(data.password);
  }

  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: specialist.userId },
      data: {
        ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
    return tx.specialist.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
        ...(data.specialty !== undefined ? { specialty: data.specialty.trim() } : {}),
        ...(data.licenseNumber !== undefined
          ? { licenseNumber: data.licenseNumber?.trim() || null }
          : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
      include: { user: { select: { id: true, email: true } } },
    });
  });
}

export async function deleteSpecialist(id: string) {
  const specialist = await prisma.specialist.findUnique({ where: { id } });
  if (!specialist) throw new AppError(404, "Especialista no encontrado");
  await prisma.user.delete({ where: { id: specialist.userId } });
}
