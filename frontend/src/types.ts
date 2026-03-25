export type Role = "ADMIN" | "SPECIALIST";

export type AppointmentStatus =
  | "RESERVED"
  | "CONFIRMED"
  | "ATTENDED"
  | "CANCELLED"
  | "NO_SHOW";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

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

/** Respuesta API enriquecida: fecha, franja horaria, snake_case opcional */
export type Appointment = {
  id: string;
  patientId: string;
  specialistId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  medicalRecord: string | null;
  reasonForVisit: string | null;
  date?: string;
  time?: { start: string; end: string };
  medical_record?: string | null;
  reason_for_visit?: string | null;
  patient: Patient;
  specialist: Omit<Specialist, "user">;
  payments?: Payment[];
};

export type Payment = {
  id: string;
  appointmentId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  method: string | null;
  paidAt: string | null;
  notes: string | null;
  appointment?: Appointment;
};
