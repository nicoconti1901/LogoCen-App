-- AlterTable
ALTER TABLE "Specialist" ADD COLUMN IF NOT EXISTS "considerations" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SpecialistDocument" (
    "id" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialistDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SpecialistDocument_specialistId_idx" ON "SpecialistDocument"("specialistId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SpecialistDocument" ADD CONSTRAINT "SpecialistDocument_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Specialist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
