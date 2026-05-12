import { specialistRepository } from "../repositories/specialist.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { normalizeProfilePhotoUrlForStorage } from "../utils/imageUrl.js";
import { hashPassword } from "../utils/password.js";
import { normalizePersonNameField } from "../utils/personName.js";
import { Weekday } from "@prisma/client";
import { assertValidTime, timeToMinutes } from "../utils/appointmentTime.js";

function normProfilePhotoUrl(url: string | null | undefined): string | null {
  return normalizeProfilePhotoUrlForStorage(url);
}

function normalizeAvailabilities(
  availabilities: Array<{ weekday: Weekday; startTime: string; endTime: string }>
): Array<{ weekday: Weekday; startTime: string; endTime: string }> {
  return availabilities.map((a) => {
    const startTime = assertValidTime(a.startTime);
    const endTime = assertValidTime(a.endTime);
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      throw new AppError(400, "La franja de disponibilidad debe tener fin posterior al inicio");
    }
    return { weekday: a.weekday, startTime, endTime };
  });
}

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
  profilePhotoUrl?: string | null;
  licenseNumber?: string | null;
  phone?: string | null;
  consultationFee?: string | number | null;
  transferAlias?: string | null;
  availabilities?: Array<{ weekday: Weekday; startTime: string; endTime: string }>;
}) {
  const email = data.email.toLowerCase().trim();
  const exists = await userRepository.findByEmail(email);
  if (exists) throw new AppError(409, "El correo ya está registrado");

  const passwordHash = await hashPassword(data.password);

  return specialistRepository.createWithUser({
    email,
    passwordHash,
    firstName: normalizePersonNameField(data.firstName),
    lastName: normalizePersonNameField(data.lastName),
    specialty: data.specialty.trim(),
    profilePhotoUrl: normProfilePhotoUrl(data.profilePhotoUrl),
    licenseNumber: data.licenseNumber?.trim() || null,
    phone: data.phone?.trim() || null,
    consultationFee: data.consultationFee === "" ? null : (data.consultationFee ?? null),
    transferAlias: data.transferAlias?.trim() || null,
    availabilities: data.availabilities ? normalizeAvailabilities(data.availabilities) : [],
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
    profilePhotoUrl: string | null;
    licenseNumber: string | null;
    phone: string | null;
    consultationFee: string | number | null;
    transferAlias: string | null;
    availabilities: Array<{ weekday: Weekday; startTime: string; endTime: string }>;
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
      ...(data.firstName !== undefined ? { firstName: normalizePersonNameField(data.firstName) } : {}),
      ...(data.lastName !== undefined ? { lastName: normalizePersonNameField(data.lastName) } : {}),
      ...(data.specialty !== undefined ? { specialty: data.specialty.trim() } : {}),
      ...(data.profilePhotoUrl !== undefined
        ? { profilePhotoUrl: normProfilePhotoUrl(data.profilePhotoUrl) }
        : {}),
      ...(data.licenseNumber !== undefined ? { licenseNumber: data.licenseNumber?.trim() || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.consultationFee !== undefined
        ? { consultationFee: data.consultationFee === "" ? null : data.consultationFee }
        : {}),
      ...(data.transferAlias !== undefined ? { transferAlias: data.transferAlias?.trim() || null } : {}),
      ...(data.availabilities !== undefined
        ? { availabilities: normalizeAvailabilities(data.availabilities) }
        : {}),
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
