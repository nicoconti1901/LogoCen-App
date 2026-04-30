import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

const include = {
  specialist: {
    select: { id: true, firstName: true, lastName: true, specialty: true },
  },
} satisfies Prisma.ClinicalHistoryEntryInclude;

export const clinicalHistoryRepository = {
  findByPatientId(patientId: string) {
    return prisma.clinicalHistoryEntry.findMany({
      where: { patientId },
      include,
      orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
    });
  },

  create(data: Prisma.ClinicalHistoryEntryCreateInput) {
    return prisma.clinicalHistoryEntry.create({ data, include });
  },

  findById(id: string) {
    return prisma.clinicalHistoryEntry.findUnique({ where: { id }, include });
  },

  update(id: string, data: Prisma.ClinicalHistoryEntryUpdateInput) {
    return prisma.clinicalHistoryEntry.update({ where: { id }, data, include });
  },

  delete(id: string) {
    return prisma.clinicalHistoryEntry.delete({ where: { id } }).then(() => undefined);
  },
};
