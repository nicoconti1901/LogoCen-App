import { Role, type Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

const include = { user: { select: { id: true, email: true } } } satisfies Prisma.SpecialistInclude;

export type SpecialistWithUser = Prisma.SpecialistGetPayload<{ include: typeof include }>;

export const specialistRepository = {
  findMany(includeInactive = false): Promise<SpecialistWithUser[]> {
    return prisma.specialist.findMany({
      where: includeInactive ? {} : { active: true },
      include,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  },

  findById(id: string): Promise<SpecialistWithUser | null> {
    return prisma.specialist.findUnique({
      where: { id },
      include,
    });
  },

  async createWithUser(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    specialty: string;
    profilePhotoUrl?: string | null;
    licenseNumber?: string | null;
    phone?: string | null;
  }): Promise<SpecialistWithUser> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          role: Role.SPECIALIST,
        },
      });
      const specialist = await tx.specialist.create({
        data: {
          userId: user.id,
          firstName: input.firstName,
          lastName: input.lastName,
          specialty: input.specialty,
          profilePhotoUrl: input.profilePhotoUrl ?? null,
          licenseNumber: input.licenseNumber ?? null,
          phone: input.phone ?? null,
        },
        include,
      });
      return specialist;
    });
  },

  async updateWithUser(
    specialistId: string,
    data: {
      email?: string;
      passwordHash?: string;
      firstName?: string;
      lastName?: string;
      specialty?: string;
      profilePhotoUrl?: string | null;
      licenseNumber?: string | null;
      phone?: string | null;
      active?: boolean;
    }
  ): Promise<SpecialistWithUser> {
    const specialist = await prisma.specialist.findUnique({ where: { id: specialistId } });
    if (!specialist) throw new Error("SPECIALIST_NOT_FOUND");

    return prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: specialist.userId },
        data: {
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
        },
      });
      return tx.specialist.update({
        where: { id: specialistId },
        data: {
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
          ...(data.profilePhotoUrl !== undefined ? { profilePhotoUrl: data.profilePhotoUrl } : {}),
          ...(data.licenseNumber !== undefined ? { licenseNumber: data.licenseNumber } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
        include,
      });
    });
  },

  async deleteCascade(specialistId: string): Promise<void> {
    const specialist = await prisma.specialist.findUnique({ where: { id: specialistId } });
    if (!specialist) throw new Error("SPECIALIST_NOT_FOUND");
    await prisma.user.delete({ where: { id: specialist.userId } });
  },
};
