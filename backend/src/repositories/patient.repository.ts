import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

export const patientRepository = {
  findMany(args?: { search?: string }): Promise<Prisma.PatientGetPayload<object>[]> {
    const search = args?.search?.trim();
    return prisma.patient.findMany({
      where: search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { documentId: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.patient.findUnique({ where: { id } });
  },

  create(data: Prisma.PatientCreateInput) {
    return prisma.patient.create({ data });
  },

  update(id: string, data: Prisma.PatientUpdateInput) {
    return prisma.patient.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.patient.delete({ where: { id } });
  },
};
