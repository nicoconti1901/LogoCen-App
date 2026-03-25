export type Role = "ADMIN" | "ESPECIALISTA";

export type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  specialistId: string | null;
  specialist: {
    id: string;
    firstName: string;
    lastName: string;
    specialty: string;
  } | null;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  documentId: string | null;
  birthDate: string | null;
  notes: string | null;
};

export type Specialist = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  specialty: string;
  licenseNumber: string | null;
  phone: string | null;
  active: boolean;
  user: { id: string; email: string };
};

export type Office = {
  id: string;
  name: string;
  number: string | null;
};

export type Appointment = {
  id: string;
  patientId: string;
  specialistId: string;
  officeId: string | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  clinicalHistory: string | null;
  patient: Patient;
  specialist: Omit<Specialist, "user">;
  office: Office | null;
};
