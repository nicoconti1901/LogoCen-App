-- Pago combinado en turnos y contraseña visible para admin en usuarios especialista
ALTER TABLE "User" ADD COLUMN "adminVisiblePassword" TEXT;

ALTER TABLE "Appointment" ADD COLUMN "paymentSplits" JSONB;

ALTER TABLE "FixedAppointmentOccurrence" ADD COLUMN "paymentSplits" JSONB;
