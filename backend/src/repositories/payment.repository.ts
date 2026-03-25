import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

const include = {
  appointment: {
    include: {
      patient: true,
      specialist: true,
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof include }>;

export const paymentRepository = {
  findById(id: string): Promise<PaymentWithRelations | null> {
    return prisma.payment.findUnique({
      where: { id },
      include,
    });
  },

  findMany(where: Prisma.PaymentWhereInput): Promise<PaymentWithRelations[]> {
    return prisma.payment.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
  },

  create(data: Prisma.PaymentCreateInput): Promise<PaymentWithRelations> {
    return prisma.payment.create({
      data,
      include,
    });
  },

  update(id: string, data: Prisma.PaymentUpdateInput): Promise<PaymentWithRelations> {
    return prisma.payment.update({
      where: { id },
      data,
      include,
    });
  },

  delete(id: string): Promise<void> {
    return prisma.payment.delete({ where: { id } }).then(() => undefined);
  },
};
