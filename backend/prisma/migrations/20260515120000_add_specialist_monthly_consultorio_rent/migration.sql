-- Columna usada por Balance / alquiler consultorio. Idempotente si ya existía (p. ej. baseline aplicada con SQL).
ALTER TABLE "Specialist" ADD COLUMN IF NOT EXISTS "monthlyConsultorioRent" DECIMAL(12,2);
