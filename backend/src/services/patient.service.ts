import { patientRepository } from "../repositories/patient.repository.js";
import { specialistRepository } from "../repositories/specialist.repository.js";
import { clinicalHistoryRepository } from "../repositories/clinicalHistory.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { Role } from "@prisma/client";

export async function listPatients(filters?: { search?: string; specialistId?: string }) {
  return patientRepository.findMany(filters);
}

function assertSpecialistPatientAccess(
  patientSpecialistId: string | null,
  user?: { role: Role; specialistId: string | null }
) {
  if (!user || user.role !== Role.SPECIALIST) return;
  if (!user.specialistId || patientSpecialistId !== user.specialistId) {
    throw new AppError(403, "Sin permisos sobre este paciente");
  }
}

export async function getPatientById(id: string, user?: { role: Role; specialistId: string | null }) {
  const p = await patientRepository.findById(id);
  if (!p) throw new AppError(404, "Paciente no encontrado");
  assertSpecialistPatientAccess(p.specialistId, user);
  return p;
}

export async function createPatient(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  documentId?: string | null;
  birthDate?: Date | null;
  notes?: string | null;
  specialistId?: string | null;
}, user?: { role: Role; specialistId: string | null }) {
  const specialistId = user?.role === Role.SPECIALIST ? user.specialistId : data.specialistId;

  if (specialistId) {
    const specialist = await specialistRepository.findById(specialistId);
    if (!specialist || !specialist.active) throw new AppError(400, "Especialista inválido o inactivo");
  }
  return patientRepository.create({
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: data.email.toLowerCase().trim(),
    phone: data.phone?.trim() || null,
    documentId: data.documentId?.trim() || null,
    birthDate: data.birthDate ?? null,
    notes: data.notes?.trim() || null,
    ...(specialistId ? { specialist: { connect: { id: specialistId } } } : {}),
  });
}

export async function updatePatient(
  id: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    documentId: string | null;
    birthDate: Date | null;
    notes: string | null;
    specialistId: string | null;
  }>
) {
  await getPatientById(id);
  if (data.specialistId) {
    const specialist = await specialistRepository.findById(data.specialistId);
    if (!specialist || !specialist.active) throw new AppError(400, "Especialista inválido o inactivo");
  }
  return patientRepository.update(id, {
    ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
    ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
    ...(data.email !== undefined ? { email: data.email.toLowerCase().trim() } : {}),
    ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
    ...(data.documentId !== undefined ? { documentId: data.documentId?.trim() || null } : {}),
    ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
    ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
    ...(data.specialistId !== undefined
      ? data.specialistId
        ? { specialist: { connect: { id: data.specialistId } } }
        : { specialist: { disconnect: true } }
      : {}),
  });
}

export async function deletePatient(id: string) {
  await getPatientById(id);
  await patientRepository.delete(id);
}

export async function listClinicalHistory(patientId: string, user?: { role: Role; specialistId: string | null }) {
  await getPatientById(patientId, user);
  return clinicalHistoryRepository.findByPatientId(patientId);
}

export async function createClinicalHistoryEntry(
  patientId: string,
  data: {
    recordDate: Date;
    diagnosis: string;
  },
  user: { role: Role; specialistId: string | null }
) {
  const patient = await getPatientById(patientId);

  if (user.role === Role.ADMIN) {
    // Admin habilitado explícitamente.
  } else if (user.role !== Role.SPECIALIST || !user.specialistId) {
    throw new AppError(403, "Solo el especialista a cargo o un administrador puede cargar historia clínica");
  } else if (!patient.specialistId || patient.specialistId !== user.specialistId) {
    throw new AppError(403, "Solo el especialista a cargo puede cargar historia clínica");
  }

  return clinicalHistoryRepository.create({
    patient: { connect: { id: patientId } },
    ...(user.specialistId
      ? { specialist: { connect: { id: user.specialistId } } }
      : patient.specialistId
        ? { specialist: { connect: { id: patient.specialistId } } }
        : {}),
    recordDate: data.recordDate,
    diagnosis: data.diagnosis.trim(),
  });
}

async function getClinicalHistoryEntryOrThrow(patientId: string, entryId: string) {
  const entry = await clinicalHistoryRepository.findById(entryId);
  if (!entry || entry.patientId !== patientId) {
    throw new AppError(404, "Entrada de historia clínica no encontrada");
  }
  return entry;
}

export async function updateClinicalHistoryEntry(
  patientId: string,
  entryId: string,
  data: Partial<{
    recordDate: Date;
    diagnosis: string;
  }>,
  user: { role: Role; specialistId: string | null }
) {
  const patient = await getPatientById(patientId);
  await getClinicalHistoryEntryOrThrow(patientId, entryId);
  if (user.role === Role.ADMIN) {
    // Admin habilitado explícitamente.
  } else if (user.role !== Role.SPECIALIST || !user.specialistId) {
    throw new AppError(403, "Solo el especialista a cargo o un administrador puede editar historia clínica");
  } else if (!patient.specialistId || patient.specialistId !== user.specialistId) {
    throw new AppError(403, "Solo el especialista a cargo puede editar historia clínica");
  }
  return clinicalHistoryRepository.update(entryId, {
    ...(data.recordDate !== undefined ? { recordDate: data.recordDate } : {}),
    ...(data.diagnosis !== undefined ? { diagnosis: data.diagnosis.trim() } : {}),
  });
}

export async function deleteClinicalHistoryEntry(
  patientId: string,
  entryId: string,
  user: { role: Role; specialistId: string | null }
) {
  const patient = await getPatientById(patientId);
  await getClinicalHistoryEntryOrThrow(patientId, entryId);
  if (user.role === Role.ADMIN) {
    // Admin habilitado explícitamente.
  } else if (user.role !== Role.SPECIALIST || !user.specialistId) {
    throw new AppError(403, "Solo el especialista a cargo o un administrador puede eliminar historia clínica");
  } else if (!patient.specialistId || patient.specialistId !== user.specialistId) {
    throw new AppError(403, "Solo el especialista a cargo puede eliminar historia clínica");
  }
  await clinicalHistoryRepository.delete(entryId);
}
