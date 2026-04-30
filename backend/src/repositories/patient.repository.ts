import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

const include = {
  specialist: {
    select: { id: true, firstName: true, lastName: true, specialty: true },
  },
} satisfies Prisma.PatientInclude;

export const patientRepository = {
  findMany(args?: { search?: string; specialistId?: string }): Promise<Prisma.PatientGetPayload<{ include: typeof include }>[]> {
    const search = args?.search?.trim();
    return prisma.patient.findMany({
      where: {
        ...(args?.specialistId ? { specialistId: args.specialistId } : {}),
        ...(search
          ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { documentId: { contains: search, mode: "insensitive" } },
            ],
          }
          : {}),
      },
      include,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.patient.findUnique({ where: { id }, include });
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
