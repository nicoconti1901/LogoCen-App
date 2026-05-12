-- Estado RESERVADO (turno con anticipo / seña) + monto abonado.
ALTER TYPE "AppointmentStatus" ADD VALUE 'RESERVADO';

ALTER TABLE "Appointment" ADD COLUMN "reservationDepositAmount" DECIMAL(12, 2);
