import { prisma } from "../config/database.js";
import { AppError } from "../middleware/errorHandler.js";

export async function listOffices() {
  return prisma.office.findMany({
    orderBy: [{ name: "asc" }],
  });
}

export async function getOfficeById(id: string) {
  const o = await prisma.office.findUnique({ where: { id } });
  if (!o) throw new AppError(404, "Consultorio no encontrado");
  return o;
}

export async function createOffice(data: { name: string; number?: string | null }) {
  return prisma.office.create({
    data: {
      name: data.name.trim(),
      number: data.number?.trim() || null,
    },
  });
}

export async function updateOffice(
  id: string,
  data: Partial<{ name: string; number: string | null }>
) {
  await getOfficeById(id);
  return prisma.office.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.number !== undefined ? { number: data.number?.trim() || null } : {}),
    },
  });
}

export async function deleteOffice(id: string) {
  await getOfficeById(id);
  await prisma.office.delete({ where: { id } });
}
