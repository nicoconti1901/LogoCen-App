import { normalizePhoneToE164 } from "./whatsappPhone";

export type ValidationResult = { ok: true } | { ok: false; message: string };

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export type FieldValidationResult<T extends string = string> =
  | { ok: true }
  | { ok: false; fields: FieldErrors<T> };

const PERSON_NAME_REGEX = /^[\p{L}][\p{L}\s'.-]*$/u;
const PHONE_DIGITS_REGEX = /^\d{10,15}$/;
const DOCUMENT_ID_REGEX = /^(\d{7,8}|[A-Za-z0-9]{6,12})$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MONEY_REGEX = /^\d+([.,]\d{1,2})?$/;
const TRANSFER_ALIAS_REGEX = /^[A-Za-z0-9.]{6,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;

export function stripPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizeMoneyInput(raw: string): string {
  return raw.trim().replace(",", ".");
}

function fail(message: string): ValidationResult {
  return { ok: false, message };
}

function ok(): ValidationResult {
  return { ok: true };
}

function collectFieldErrors<T extends string>(
  checks: Array<[T, ValidationResult]>
): FieldValidationResult<T> {
  const fields: FieldErrors<T> = {};
  for (const [field, result] of checks) {
    if (!result.ok) fields[field] = result.message;
  }
  if (Object.keys(fields).length === 0) return { ok: true };
  return { ok: false, fields };
}

export function validatePersonName(value: string): ValidationResult {
  const t = value.trim();
  if (t.length < 2) return fail("Mínimo 2 caracteres");
  if (t.length > 80) return fail("Máximo 80 caracteres");
  if (!PERSON_NAME_REGEX.test(t)) {
    return fail("Solo letras, espacios, guiones y apóstrofes");
  }
  return ok();
}

export function validateEmail(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return fail("El correo es obligatorio");
  if (!EMAIL_REGEX.test(t)) return fail("Correo inválido");
  return ok();
}

export function validateOptionalPhone(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return ok();
  if (!PHONE_DIGITS_REGEX.test(stripPhoneDigits(t))) {
    return fail("10 a 15 dígitos, sin letras");
  }
  return ok();
}

/** Celular obligatorio del paciente; debe normalizar a E.164 AR (WhatsApp). */
export function validatePatientWhatsappPhone(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return fail("El celular es obligatorio para recordatorios por WhatsApp");
  if (!normalizePhoneToE164(t)) {
    return fail(
      "Formato inválido. Usá móvil argentino: 10 dígitos (área + número) o +54 9 y el número, sin 15 delante"
    );
  }
  return ok();
}

export function validateOptionalDocumentId(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return ok();
  if (!DOCUMENT_ID_REGEX.test(t)) {
    return fail("DNI 7-8 dígitos o pasaporte alfanumérico");
  }
  return ok();
}

export function validateDateOnly(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return fail("Campo obligatorio");
  if (!DATE_ONLY_REGEX.test(t)) return fail("Use formato AAAA-MM-DD");
  return ok();
}

export function validateOptionalDateOnly(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return ok();
  if (!DATE_ONLY_REGEX.test(t)) return fail("Use formato AAAA-MM-DD");
  return ok();
}

export function validateBirthDate(value: string): ValidationResult {
  const dateCheck = validateOptionalDateOnly(value);
  if (!dateCheck.ok) return dateCheck;
  if (!value.trim()) return ok();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (value > todayIso) return fail("No puede ser una fecha futura");
  return ok();
}

export function validateTime(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return fail("Campo obligatorio");
  if (!TIME_REGEX.test(t)) return fail("Use formato HH:mm (24 h)");
  return ok();
}

export function validateEndTimeAfterStart(startTime: string, endTime: string): ValidationResult {
  const end = validateTime(endTime);
  if (!end.ok) return end;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (eh * 60 + em <= sh * 60 + sm) {
    return fail("Debe ser posterior al inicio");
  }
  return ok();
}

export function validateOptionalMoney(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return ok();
  if (!MONEY_REGEX.test(normalizeMoneyInput(t))) {
    return fail("Use números con hasta 2 decimales");
  }
  return ok();
}

export function validatePositiveMoney(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return fail("Campo obligatorio");
  if (!MONEY_REGEX.test(normalizeMoneyInput(t))) {
    return fail("Use números con hasta 2 decimales");
  }
  const n = Number(normalizeMoneyInput(t));
  if (!Number.isFinite(n) || n <= 0) return fail("Debe ser mayor a 0");
  return ok();
}

export function validateOptionalTransferAlias(value: string): ValidationResult {
  const t = value.trim();
  if (!t) return ok();
  if (!TRANSFER_ALIAS_REGEX.test(t)) {
    return fail("6-20 caracteres: letras, números y puntos");
  }
  return ok();
}

export function validateLongText(value: string, max: number): ValidationResult {
  if (value.length > max) return fail(`Máximo ${max} caracteres`);
  return ok();
}

export function validatePassword(value: string, required = true): ValidationResult {
  const t = value.trim();
  if (!t) return required ? fail("Campo obligatorio") : ok();
  if (t.length < 8) return fail("Mínimo 8 caracteres");
  if (!STRONG_PASSWORD_REGEX.test(t)) {
    return fail("Incluí mayúscula, minúscula, número y símbolo");
  }
  return ok();
}

export function validateSpecialty(value: string): ValidationResult {
  const t = value.trim();
  if (t.length < 2) return fail("Mínimo 2 caracteres");
  if (t.length > 120) return fail("Máximo 120 caracteres");
  return ok();
}

export function validateExpenseDescription(value: string): ValidationResult {
  const t = value.trim();
  if (t.length < 2) return fail("Mínimo 2 caracteres");
  if (t.length > 200) return fail("Máximo 200 caracteres");
  return ok();
}

export function validateDiagnosis(value: string): ValidationResult {
  const t = value.trim();
  if (t.length < 2) return fail("Mínimo 2 caracteres");
  if (t.length > 5000) return fail("Máximo 5000 caracteres");
  return ok();
}

export function validateLicenseNumber(value: string): ValidationResult {
  if (value.trim().length > 50) return fail("Máximo 50 caracteres");
  return ok();
}

export function validateAvailabilities(
  rows: Array<{ startTime: string; endTime: string }>
): ValidationResult {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const start = validateTime(row.startTime);
    if (!start.ok) return fail(`Franja ${i + 1}: ${start.message}`);
    const end = validateEndTimeAfterStart(row.startTime, row.endTime);
    if (!end.ok) return fail(`Franja ${i + 1}: ${end.message}`);
  }
  return ok();
}

export function parsePositiveMoneyInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const normalized = normalizeMoneyInput(t);
  if (!MONEY_REGEX.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type PatientFormFields =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "documentId"
  | "birthDate"
  | "notes"
  | "specialistId";

export function validatePatientForm(
  form: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    documentId: string;
    birthDate: string;
    notes: string;
    specialistId: string;
  },
  options: { requireSpecialist: boolean }
): FieldValidationResult<PatientFormFields> {
  const checks: Array<[PatientFormFields, ValidationResult]> = [
    ["firstName", validatePersonName(form.firstName)],
    ["lastName", validatePersonName(form.lastName)],
    ["email", validateEmail(form.email)],
    ["phone", validatePatientWhatsappPhone(form.phone)],
    ["documentId", validateOptionalDocumentId(form.documentId)],
    ["birthDate", validateBirthDate(form.birthDate)],
    ["notes", validateLongText(form.notes, 2000)],
  ];
  if (options.requireSpecialist && !form.specialistId.trim()) {
    checks.push(["specialistId", fail("Seleccioná un especialista")]);
  }
  return collectFieldErrors(checks);
}

export type ClinicalHistoryFields = "recordDate" | "diagnosis";

export function validateClinicalHistoryForm(form: {
  recordDate: string;
  diagnosis: string;
}): FieldValidationResult<ClinicalHistoryFields> {
  return collectFieldErrors([
    ["recordDate", validateDateOnly(form.recordDate)],
    ["diagnosis", validateDiagnosis(form.diagnosis)],
  ]);
}

export type SpecialistFormFields =
  | "email"
  | "password"
  | "confirmPassword"
  | "firstName"
  | "lastName"
  | "specialty"
  | "licenseNumber"
  | "phone"
  | "consultationFee"
  | "monthlyConsultorioRent"
  | "transferAlias"
  | "considerations"
  | "availabilities";

export function validateSpecialistForm(
  form: {
    email: string;
    password: string;
    confirmPassword: string;
    firstName: string;
    lastName: string;
    specialty: string;
    licenseNumber: string;
    phone: string;
    consultationFee: string;
    monthlyConsultorioRent: string;
    transferAlias: string;
    considerations: string;
    availabilities: Array<{ startTime: string; endTime: string }>;
  },
  options: { editing: boolean }
): FieldValidationResult<SpecialistFormFields> {
  const checks: Array<[SpecialistFormFields, ValidationResult]> = [
    ["email", validateEmail(form.email)],
    ["firstName", validatePersonName(form.firstName)],
    ["lastName", validatePersonName(form.lastName)],
    ["specialty", validateSpecialty(form.specialty)],
    ["licenseNumber", validateLicenseNumber(form.licenseNumber)],
    ["phone", validateOptionalPhone(form.phone)],
    ["consultationFee", validateOptionalMoney(form.consultationFee)],
    ["monthlyConsultorioRent", validateOptionalMoney(form.monthlyConsultorioRent)],
    ["transferAlias", validateOptionalTransferAlias(form.transferAlias)],
    ["considerations", validateLongText(form.considerations, 10000)],
  ];

  const passwordRequired = !options.editing;
  const passwordCheck = validatePassword(form.password, passwordRequired);
  if (!passwordCheck.ok) checks.push(["password", passwordCheck]);

  if (!options.editing || form.password.trim()) {
    if (form.password !== form.confirmPassword) {
      checks.push(["confirmPassword", fail("No coincide con la contraseña")]);
    }
  }

  const availabilityCheck = validateAvailabilities(form.availabilities);
  if (!availabilityCheck.ok) checks.push(["availabilities", availabilityCheck]);

  return collectFieldErrors(checks);
}

export type ExpenseFormFields = "description" | "amount" | "expenseDate";

export function validateExpenseForm(form: {
  description: string;
  amount: string;
  expenseDate: string;
}): FieldValidationResult<ExpenseFormFields> {
  return collectFieldErrors([
    ["description", validateExpenseDescription(form.description)],
    ["amount", validatePositiveMoney(form.amount)],
    ["expenseDate", validateDateOnly(form.expenseDate)],
  ]);
}

export type AppointmentFormFields =
  | "patientId"
  | "specialistId"
  | "consultorio"
  | "dateStr"
  | "startTimeStr"
  | "endTimeStr"
  | "paymentDateStr"
  | "reservationDepositStr"
  | "reasonForVisit"
  | "medicalRecord"
  | "fixedEffectiveUntil";

export function validateAppointmentForm(input: {
  patientId: string;
  specialistId: string;
  consultorio: string;
  requireConsultorio: boolean;
  requireSpecialist: boolean;
  dateStr: string;
  startTimeStr: string;
  endTimeStr: string;
  showEndTime: boolean;
  paymentCompleted: boolean;
  paymentDateStr: string;
  status: string;
  reservationDepositStr: string;
  reasonForVisit: string;
  medicalRecord: string;
  fixedEffectiveUntil: string;
  isFixedSeries: boolean;
}): FieldValidationResult<AppointmentFormFields> {
  const checks: Array<[AppointmentFormFields, ValidationResult]> = [];

  if (!input.patientId.trim()) {
    checks.push(["patientId", fail("Seleccioná un paciente")]);
  }
  if (input.requireSpecialist && !input.specialistId.trim()) {
    checks.push(["specialistId", fail("Seleccioná un especialista")]);
  }
  if (input.requireConsultorio && !input.consultorio.trim()) {
    checks.push(["consultorio", fail("Seleccioná un consultorio")]);
  }

  checks.push(
    ["dateStr", validateDateOnly(input.dateStr)],
    ["startTimeStr", validateTime(input.startTimeStr)],
    ["reasonForVisit", validateLongText(input.reasonForVisit, 1000)],
    ["medicalRecord", validateLongText(input.medicalRecord, 5000)]
  );

  if (input.showEndTime) {
    checks.push(["endTimeStr", validateEndTimeAfterStart(input.startTimeStr, input.endTimeStr)]);
  }

  if (input.paymentCompleted) {
    checks.push(["paymentDateStr", validateDateOnly(input.paymentDateStr)]);
  }

  if (input.status === "RESERVADO") {
    checks.push(["reservationDepositStr", validatePositiveMoney(input.reservationDepositStr)]);
  }

  if (input.isFixedSeries && input.fixedEffectiveUntil.trim()) {
    const untilCheck = validateOptionalDateOnly(input.fixedEffectiveUntil);
    if (!untilCheck.ok) {
      checks.push(["fixedEffectiveUntil", untilCheck]);
    } else if (input.fixedEffectiveUntil < input.dateStr) {
      checks.push(["fixedEffectiveUntil", fail("No puede ser anterior al inicio")]);
    }
  }

  return collectFieldErrors(checks);
}

export type LoginFormFields = "email" | "password";

export function validateLoginForm(form: { email: string; password: string }): FieldValidationResult<LoginFormFields> {
  const checks: Array<[LoginFormFields, ValidationResult]> = [["email", validateEmail(form.email)]];
  if (!form.password.trim()) checks.push(["password", fail("Campo obligatorio")]);
  return collectFieldErrors(checks);
}
