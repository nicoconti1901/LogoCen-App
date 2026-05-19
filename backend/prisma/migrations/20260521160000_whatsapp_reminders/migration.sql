-- CreateEnum
CREATE TYPE "WhatsappReminderKind" AS ENUM ('STANDARD_24H', 'SHORT_NOTICE');

-- CreateEnum
CREATE TYPE "WhatsappReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "WhatsappReminder" (
    "id" TEXT NOT NULL,
    "appointmentRef" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" "WhatsappReminderKind" NOT NULL,
    "status" "WhatsappReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledSendAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "waMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappReminder_appointmentRef_kind_key" ON "WhatsappReminder"("appointmentRef", "kind");

-- CreateIndex
CREATE INDEX "WhatsappReminder_status_scheduledSendAt_idx" ON "WhatsappReminder"("status", "scheduledSendAt");

-- CreateIndex
CREATE INDEX "WhatsappReminder_patientId_idx" ON "WhatsappReminder"("patientId");

-- AddForeignKey
ALTER TABLE "WhatsappReminder" ADD CONSTRAINT "WhatsappReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
