export type Role = "ADMIN" | "SPECIALIST";

export type AppointmentStatus =
  | "RESERVED"
  | "RESERVADO"
  | "ATTENDED"
  | "AUSENTE_CON_AVISO"
  | "AUSENTE_SIN_AVISO";

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
  /** Monto de anticipo cuando `status` es RESERVADO (string decimal desde la API). */
  reservationDepositAmount?: string | null;
  paymentMethod: AppointmentPaymentMethod | null;
  paymentCompleted: boolean;
  paymentDate: string | null;
  specialistSettledAt: string | null;
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

export type FinanceConfig = {
  monthlyFixedExpense: string;
};

export type FinanceExpenseType = "FIXED_MONTHLY" | "MONTHLY_VARIABLE";

export type FinanceExpense = {
  id: string;
  type: FinanceExpenseType;
  description: string;
  amount: string;
  expenseDate: string;
};
