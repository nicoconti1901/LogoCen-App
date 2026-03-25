import { specialistRepository } from "../repositories/specialist.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { hashPassword } from "../utils/password.js";

export async function listSpecialists(includeInactive = false) {
  return specialistRepository.findMany(includeInactive);
}

export async function getSpecialistById(id: string) {
  const s = await specialistRepository.findById(id);
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
  const exists = await userRepository.findByEmail(email);
  if (exists) throw new AppError(409, "El correo ya está registrado");

  const passwordHash = await hashPassword(data.password);

  return specialistRepository.createWithUser({
    email,
    passwordHash,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    specialty: data.specialty.trim(),
    licenseNumber: data.licenseNumber?.trim() || null,
    phone: data.phone?.trim() || null,
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
  const specialist = await specialistRepository.findById(id);
  if (!specialist) throw new AppError(404, "Especialista no encontrado");

  if (data.email && data.email.toLowerCase().trim() !== specialist.user.email) {
    const taken = await userRepository.findByEmail(data.email);
    if (taken) throw new AppError(409, "El correo ya está en uso");
  }

  let passwordHash: string | undefined;
  if (data.password) {
    passwordHash = await hashPassword(data.password);
  }

  try {
    return await specialistRepository.updateWithUser(id, {
      ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
      ...(data.specialty !== undefined ? { specialty: data.specialty.trim() } : {}),
      ...(data.licenseNumber !== undefined ? { licenseNumber: data.licenseNumber?.trim() || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SPECIALIST_NOT_FOUND") {
      throw new AppError(404, "Especialista no encontrado");
    }
    throw e;
  }
}

export async function deleteSpecialist(id: string) {
  try {
    await specialistRepository.deleteCascade(id);
  } catch (e) {
    if (e instanceof Error && e.message === "SPECIALIST_NOT_FOUND") {
      throw new AppError(404, "Especialista no encontrado");
    }
    throw e;
  }
}
