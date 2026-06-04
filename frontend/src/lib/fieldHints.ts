/** Textos de ayuda bajo campos de formulario (pacientes, turnos). */

export const HINT_PATIENT_NAME =
  "Solo letras, espacios, guiones y apóstrofes. Mínimo 2 caracteres.";

export const HINT_PATIENT_EMAIL = "Correo de contacto del paciente (ej. nombre@ejemplo.com).";

export const HINT_PATIENT_PHONE_WHATSAPP =
  "Celular argentino para recordatorios por WhatsApp. Ejemplos: 11 4021-5890, 291 4021589 o +54 9 11 4021-5890. " +
  "Usá 10 dígitos (código de área + número) sin el 15 delante; el sistema agrega el 9 del móvil. " +
  "Si cargás +54, incluí el 9 después del país (549…).";

export const HINT_PATIENT_DOCUMENT =
  "Opcional. DNI: 7 u 8 dígitos; pasaporte: 6 a 12 caracteres alfanuméricos.";

export const HINT_PATIENT_BIRTH_DATE =
  "Opcional. No puede ser una fecha futura.";

export const HINT_PATIENT_SPECIALIST = "Profesional a cargo del paciente en el centro.";

export const HINT_APPOINTMENT_PATIENT = "Paciente al que corresponde el turno.";

export const HINT_APPOINTMENT_SPECIALIST = "Profesional que atiende el turno.";

export const HINT_APPOINTMENT_DATE = "Día del turno (formato AAAA-MM-DD).";

export const HINT_APPOINTMENT_TIME = "Horario en formato 24 h (HH:mm). La hora de fin debe ser posterior al inicio.";

export const HINT_APPOINTMENT_CONSULTORIO =
  "Obligatorio para turnos presenciales. No aplica si el estado es «Ausente con aviso».";

export const HINT_APPOINTMENT_PAYMENT_DATE =
  "Fecha en que se registró el cobro (AAAA-MM-DD). Obligatoria si marcás pago realizado.";

export const HINT_APPOINTMENT_RESERVATION_DEPOSIT =
  "Seña en pesos. Obligatoria si el estado es «Reservado».";
