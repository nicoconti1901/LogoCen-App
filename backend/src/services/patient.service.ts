import { patientRepository } from "../repositories/patient.repository.js";
import { AppError } from "../middleware/errorHandler.js";

export async function listPatients(search?: string) {
  return patientRepository.findMany({ search });
}

export async function getPatientById(id: string) {
  const p = await patientRepository.findById(id);
  if (!p) throw new AppError(404, "Paciente no encontrado");
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
}) {
  return patientRepository.create({
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: data.email.toLowerCase().trim(),
    phone: data.phone?.trim() || null,
    documentId: data.documentId?.trim() || null,
    birthDate: data.birthDate ?? null,
    notes: data.notes?.trim() || null,
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
  }>
) {
  await getPatientById(id);
  return patientRepository.update(id, {
    ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
    ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
    ...(data.email !== undefined ? { email: data.email.toLowerCase().trim() } : {}),
    ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
    ...(data.documentId !== undefined ? { documentId: data.documentId?.trim() || null } : {}),
    ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
    ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
  });
}

export async function deletePatient(id: string) {
  await getPatientById(id);
  await patientRepository.delete(id);
}
