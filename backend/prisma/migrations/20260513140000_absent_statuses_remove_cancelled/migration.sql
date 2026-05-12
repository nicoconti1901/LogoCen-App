-- Reemplaza CANCELLED / NO_SHOW por AUSENTE_CON_AVISO / AUSENTE_SIN_AVISO.
-- Citas canceladas pasan a ATTENDED con pago marcado para no generar deuda ficticia.
CREATE TYPE "AppointmentStatus_new" AS ENUM (
  'RESERVED',
  'RESERVADO',
  'ATTENDED',
  'AUSENTE_CON_AVISO',
  'AUSENTE_SIN_AVISO'
);

ALTER TABLE "Appointment" ADD COLUMN "status_migrated" "AppointmentStatus_new";

UPDATE "Appointment"
SET
  "paymentCompleted" = CASE
    WHEN "status"::text = 'CANCELLED' THEN true
    ELSE "paymentCompleted"
  END,
  "status_migrated" = (
    CASE "status"::text
      WHEN 'RESERVED' THEN 'RESERVED'
      WHEN 'RESERVADO' THEN 'RESERVADO'
      WHEN 'ATTENDED' THEN 'ATTENDED'
      WHEN 'NO_SHOW' THEN 'AUSENTE_SIN_AVISO'
      WHEN 'CANCELLED' THEN 'ATTENDED'
      ELSE 'ATTENDED'
    END
  )::"AppointmentStatus_new";

ALTER TABLE "Appointment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Appointment" DROP COLUMN "status";
ALTER TABLE "Appointment" RENAME COLUMN "status_migrated" TO "status";
ALTER TABLE "Appointment" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'RESERVED'::"AppointmentStatus_new";

DROP TYPE "AppointmentStatus";
ALTER TYPE "AppointmentStatus_new" RENAME TO "AppointmentStatus";
ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'RESERVED'::"AppointmentStatus";
