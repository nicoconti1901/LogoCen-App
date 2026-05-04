import { api } from "./client";
import type {
  Appointment,
  AuthUser,
  LoginResponse,
  Patient,
  Payment,
  Specialist,
  ClinicalHistoryEntry,
} from "../types";

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
  return data;
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<{ user: AuthUser }>("/auth/me");
  return data.user;
}

export async function fetchSpecialists(includeInactive?: boolean): Promise<Specialist[]> {
  const { data } = await api.get<Specialist[]>("/specialists", {
    params: includeInactive ? { includeInactive: true } : {},
  });
  return data;
}

export async function fetchSpecialist(id: string): Promise<Specialist> {
  const { data } = await api.get<Specialist>(`/specialists/${id}`);
  return data;
}

export async function createSpecialist(body: {
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
  availabilities?: Array<{
    weekday: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
    startTime: string;
    endTime: string;
  }>;
}): Promise<Specialist> {
  const { data } = await api.post<Specialist>("/specialists", body);
  return data;
}

export async function updateSpecialist(
  id: string,
  body: Partial<{
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
    availabilities: Array<{
      weekday: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
      startTime: string;
      endTime: string;
    }>;
    active: boolean;
  }>
): Promise<Specialist> {
  const { data } = await api.patch<Specialist>(`/specialists/${id}`, body);
  return data;
}

export type UploadedSpecialistPhoto = {
  url: string;
  relativeUrl: string;
};

export async function uploadSpecialistProfilePhoto(file: File): Promise<UploadedSpecialistPhoto> {
  const formData = new FormData();
  formData.append("photo", file);
  const { data } = await api.post<UploadedSpecialistPhoto>("/specialists/profile-photo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteSpecialist(id: string): Promise<void> {
  await api.delete(`/specialists/${id}`);
}

export async function fetchPatients(search?: string, specialistId?: string): Promise<Patient[]> {
  const { data } = await api.get<Patient[]>("/patients", {
    params: {
      ...(search ? { search } : {}),
      ...(specialistId ? { specialistId } : {}),
    },
  });
  return data;
}

export async function createPatient(body: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  documentId?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  specialistId?: string | null;
}): Promise<Patient> {
  const { data } = await api.post<Patient>("/patients", body);
  return data;
}

export async function updatePatient(id: string, body: Partial<Patient>): Promise<Patient> {
  const { data } = await api.patch<Patient>(`/patients/${id}`, body);
  return data;
}

export async function deletePatient(id: string): Promise<void> {
  await api.delete(`/patients/${id}`);
}

export async function fetchPatientClinicalHistory(patientId: string): Promise<ClinicalHistoryEntry[]> {
  const { data } = await api.get<ClinicalHistoryEntry[]>(`/patients/${patientId}/clinical-history`);
  return data;
}

export async function createPatientClinicalHistory(
  patientId: string,
  body: { recordDate: string; diagnosis: string }
): Promise<ClinicalHistoryEntry> {
  const { data } = await api.post<ClinicalHistoryEntry>(`/patients/${patientId}/clinical-history`, body);
  return data;
}

export async function updatePatientClinicalHistory(
  patientId: string,
  entryId: string,
  body: Partial<{ recordDate: string; diagnosis: string }>
): Promise<ClinicalHistoryEntry> {
  const { data } = await api.patch<ClinicalHistoryEntry>(`/patients/${patientId}/clinical-history/${entryId}`, body);
  return data;
}

export async function deletePatientClinicalHistory(patientId: string, entryId: string): Promise<void> {
  await api.delete(`/patients/${patientId}/clinical-history/${entryId}`);
}

export type AppointmentListParams = {
  from?: string;
  to?: string;
  today?: boolean;
  upcoming?: boolean;
  status?: string;
  specialistId?: string;
  patientId?: string;
};

export async function fetchAppointments(params?: AppointmentListParams): Promise<Appointment[]> {
  const { data } = await api.get<Appointment[]>("/appointments", { params });
  return data;
}

export async function fetchAppointment(id: string): Promise<Appointment> {
  const { data } = await api.get<Appointment>(`/appointments/${id}`);
  return data;
}

export async function createAppointment(body: {
  patientId: string;
  specialistId: string;
  consultorio: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: string;
  paymentMethod?: string | null;
  paymentCompleted?: boolean;
  paymentDate?: string | null;
  medicalRecord?: string | null;
  reasonForVisit?: string | null;
}): Promise<Appointment> {
  const { data } = await api.post<Appointment>("/appointments", body);
  return data;
}

export async function updateAppointment(
  id: string,
  body: Partial<{
    patientId: string;
    specialistId: string;
    consultorio: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    paymentMethod: string | null;
    paymentCompleted: boolean;
    paymentDate: string | null;
    specialistSettledAt: string | null;
    medicalRecord: string | null;
    reasonForVisit: string | null;
  }>
): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/appointments/${id}`, body);
  return data;
}

export async function deleteAppointment(id: string): Promise<void> {
  await api.delete(`/appointments/${id}`);
}

export async function fetchPayments(params?: { appointmentId?: string; status?: string }): Promise<Payment[]> {
  const { data } = await api.get<Payment[]>("/payments", { params });
  return data;
}

export async function createPayment(body: {
  appointmentId: string;
  amount: string | number;
  currency?: string;
  status?: string;
  method?: string | null;
  paidAt?: string | null;
  notes?: string | null;
}): Promise<Payment> {
  const { data } = await api.post<Payment>("/payments", body);
  return data;
}

export async function updatePayment(
  id: string,
  body: Partial<{
    amount: string | number;
    currency: string;
    status: string;
    method: string | null;
    paidAt: string | null;
    notes: string | null;
  }>
): Promise<Payment> {
  const { data } = await api.patch<Payment>(`/payments/${id}`, body);
  return data;
}
