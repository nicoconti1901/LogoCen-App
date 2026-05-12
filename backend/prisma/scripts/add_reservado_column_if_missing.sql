-- Idempotente: aplica cambios de 20260512120000 si la DB no siguió el historial de Prisma.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'RESERVADO';
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "reservationDepositAmount" DECIMAL(12, 2);
