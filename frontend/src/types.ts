export type Role = "ADMIN" | "SPECIALIST";

export type AppointmentStatus = "RESERVED" | "ATTENDED" | "CANCELLED" | "NO_SHOW";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type AppointmentPaymentMethod =
  | "TRANSFER_TO_LOGOCEN"
  | "TRANSFER_TO_SPECIALIST"
  | "CASH_TO_LOGOCEN";

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
  specialistId: string | null;
  specialist: Pick<Specialist, "id" | "firstName" | "lastName" | "specialty"> | null;
};

export type ClinicalHistoryEntry = {
  id: string;
  patientId: string;
  specialistId: string | null;
  recordDate: string;
  diagnosis: string;
  createdAt: string;
  updatedAt: string;
  specialist: Pick<Specialist, "id" | "firstName" | "lastName" | "specialty"> | null;
};

export type Specialist = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  specialty: string;
  profilePhotoUrl: string | null;
  licenseNumber: string | null;
  phone: string | null;
  consultationFee: string | null;
  transferAlias: string | null;
  availabilities: SpecialistAvailability[];
  active: boolean;
  user: { id: string; email: string };
};

export type SpecialistAvailability = {
  id: string;
  specialistId: string;
  weekday: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
  startTime: string;
  endTime: string;
};

/** Respuesta API enriquecida: fecha, franja horaria, snake_case opcional */
export type Appointment = {
  id: string;
  patientId: string;
  specialistId: string;
  consultorio: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  paymentMethod: AppointmentPaymentMethod | null;
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
