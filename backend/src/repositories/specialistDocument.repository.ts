import { prisma } from "../config/database.js";

export const specialistDocumentRepository = {
  findBySpecialistId(specialistId: string) {
    return prisma.specialistDocument.findMany({
      where: { specialistId },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.specialistDocument.findUnique({ where: { id } });
  },

  create(input: {
    specialistId: string;
    fileName: string;
    mimeType: string;
    storagePath: string;
    fileSize: number;
  }) {
    return prisma.specialistDocument.create({ data: input });
  },

  delete(id: string) {
    return prisma.specialistDocument.delete({ where: { id } });
  },
};
