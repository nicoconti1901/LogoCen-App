CREATE TABLE "FixedAppointmentOccurrence" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'RESERVED',
    "reservationDepositAmount" DECIMAL(12,2),
    "paymentMethod" "AppointmentPaymentMethod",
    "paymentCompleted" BOOLEAN NOT NULL DEFAULT false,
    "paymentDate" DATE,
    "specialistSettledAt" TIMESTAMP(3),
    "medicalRecord" TEXT,
    "reasonForVisit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAppointmentOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixedAppointmentOccurrence_seriesId_occurrenceDate_key" ON "FixedAppointmentOccurrence"("seriesId", "occurrenceDate");
CREATE INDEX "FixedAppointmentOccurrence_seriesId_occurrenceDate_idx" ON "FixedAppointmentOccurrence"("seriesId", "occurrenceDate");

ALTER TABLE "FixedAppointmentOccurrence" ADD CONSTRAINT "FixedAppointmentOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "FixedAppointmentSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
