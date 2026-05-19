-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PatientConfirmationSource" AS ENUM ('MANUAL', 'WHATSAPP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "patientConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "patientConfirmationSource" "PatientConfirmationSource";

-- AlterTable
ALTER TABLE "FixedAppointmentOccurrence" ADD COLUMN IF NOT EXISTS "patientConfirmedAt" TIMESTAMP(3);
ALTER TABLE "FixedAppointmentOccurrence" ADD COLUMN IF NOT EXISTS "patientConfirmationSource" "PatientConfirmationSource";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Appointment_patientConfirmedAt_idx" ON "Appointment"("patientConfirmedAt");
CREATE INDEX IF NOT EXISTS "FixedAppointmentOccurrence_patientConfirmedAt_idx" ON "FixedAppointmentOccurrence"("patientConfirmedAt");
