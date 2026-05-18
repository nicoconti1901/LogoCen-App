-- Turnos fijos semanales (plantilla + excepciones por fecha; sin materializar cada ocurrencia).
CREATE TABLE "FixedAppointmentSeries" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "consultorio" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "startTime" TEXT NOT NULL,
    "displayDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "effectiveFrom" DATE NOT NULL,
    "effectiveUntil" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reasonForVisit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAppointmentSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FixedAppointmentSkip" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "skipDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAppointmentSkip_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FixedAppointmentSeries_specialistId_weekday_active_idx" ON "FixedAppointmentSeries"("specialistId", "weekday", "active");
CREATE INDEX "FixedAppointmentSeries_patientId_active_idx" ON "FixedAppointmentSeries"("patientId", "active");

CREATE UNIQUE INDEX "FixedAppointmentSkip_seriesId_skipDate_key" ON "FixedAppointmentSkip"("seriesId", "skipDate");
CREATE INDEX "FixedAppointmentSkip_seriesId_idx" ON "FixedAppointmentSkip"("seriesId");

ALTER TABLE "FixedAppointmentSeries" ADD CONSTRAINT "FixedAppointmentSeries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FixedAppointmentSeries" ADD CONSTRAINT "FixedAppointmentSeries_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FixedAppointmentSkip" ADD CONSTRAINT "FixedAppointmentSkip_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "FixedAppointmentSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
