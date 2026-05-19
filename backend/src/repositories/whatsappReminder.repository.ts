import {
  Prisma,
  WhatsappReminderKind,
  WhatsappReminderStatus,
  type WhatsappReminder,
} from "@prisma/client";
import { prisma } from "../config/database.js";

export const whatsappReminderRepository = {
  upsertScheduled(data: {
    appointmentRef: string;
    patientId: string;
    kind: WhatsappReminderKind;
    scheduledSendAt: Date;
  }): Promise<WhatsappReminder> {
    return prisma.whatsappReminder.upsert({
      where: {
        appointmentRef_kind: {
          appointmentRef: data.appointmentRef,
          kind: data.kind,
        },
      },
      create: {
        appointmentRef: data.appointmentRef,
        patientId: data.patientId,
        kind: data.kind,
        scheduledSendAt: data.scheduledSendAt,
        status: WhatsappReminderStatus.SCHEDULED,
      },
      update: {
        patientId: data.patientId,
        scheduledSendAt: data.scheduledSendAt,
        status: WhatsappReminderStatus.SCHEDULED,
        sentAt: null,
        waMessageId: null,
        lastError: null,
      },
    });
  },

  cancelPendingForAppointment(appointmentRef: string): Promise<number> {
    return prisma.whatsappReminder
      .updateMany({
        where: {
          appointmentRef,
          status: WhatsappReminderStatus.SCHEDULED,
        },
        data: { status: WhatsappReminderStatus.CANCELLED },
      })
      .then((r) => r.count);
  },

  findDue(now: Date, limit = 50): Promise<WhatsappReminder[]> {
    return prisma.whatsappReminder.findMany({
      where: {
        status: WhatsappReminderStatus.SCHEDULED,
        scheduledSendAt: { lte: now },
      },
      orderBy: { scheduledSendAt: "asc" },
      take: limit,
    });
  },

  markSent(id: string, waMessageId: string): Promise<WhatsappReminder> {
    return prisma.whatsappReminder.update({
      where: { id },
      data: {
        status: WhatsappReminderStatus.SENT,
        sentAt: new Date(),
        waMessageId,
        lastError: null,
      },
    });
  },

  markFailed(id: string, error: string): Promise<WhatsappReminder> {
    return prisma.whatsappReminder.update({
      where: { id },
      data: {
        status: WhatsappReminderStatus.FAILED,
        lastError: error.slice(0, 500),
      },
    });
  },

  markSkipped(id: string, reason: string): Promise<WhatsappReminder> {
    return prisma.whatsappReminder.update({
      where: { id },
      data: {
        status: WhatsappReminderStatus.SKIPPED,
        lastError: reason.slice(0, 500),
      },
    });
  },

  findLatestByAppointmentRef(appointmentRef: string): Promise<WhatsappReminder | null> {
    return prisma.whatsappReminder.findFirst({
      where: { appointmentRef },
      orderBy: { scheduledSendAt: "desc" },
    });
  },
};

export type { WhatsappReminder };
