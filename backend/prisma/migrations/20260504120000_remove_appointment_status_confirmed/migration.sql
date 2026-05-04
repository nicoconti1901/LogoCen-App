-- Quitar estado CONFIRMED: pasar citas a RESERVADO y reemplazar el enum en PostgreSQL.
-- Ejecutar con `npx prisma migrate deploy` (o aplicar este SQL antes de `prisma db push` si aún no usás migraciones).

UPDATE "Appointment" SET status = 'RESERVED' WHERE status = 'CONFIRMED';

ALTER TYPE "AppointmentStatus" RENAME TO "AppointmentStatus_old";

CREATE TYPE "AppointmentStatus" AS ENUM ('RESERVED', 'ATTENDED', 'CANCELLED', 'NO_SHOW');

ALTER TABLE "Appointment" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Appointment"
  ALTER COLUMN "status" TYPE "AppointmentStatus" USING ("status"::text::"AppointmentStatus");

ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'RESERVED'::"AppointmentStatus";

DROP TYPE "AppointmentStatus_old";
