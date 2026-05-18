-- Alquiler por mes calendario (replicación automática mes a mes en la app).
CREATE TABLE "SpecialistConsultorioRentMonth" (
    "id" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialistConsultorioRentMonth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpecialistConsultorioRentMonth_specialistId_yearMonth_key" ON "SpecialistConsultorioRentMonth"("specialistId", "yearMonth");

CREATE INDEX "SpecialistConsultorioRentMonth_yearMonth_idx" ON "SpecialistConsultorioRentMonth"("yearMonth");

ALTER TABLE "SpecialistConsultorioRentMonth" ADD CONSTRAINT "SpecialistConsultorioRentMonth_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
