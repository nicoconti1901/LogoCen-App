import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

const userInclude = { specialist: true } satisfies Prisma.UserInclude;

export type UserWithSpecialist = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export const userRepository = {
  findByEmail(email: string): Promise<UserWithSpecialist | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: userInclude,
    });
  },

  findById(id: string): Promise<UserWithSpecialist | null> {
    return prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
  },
};
