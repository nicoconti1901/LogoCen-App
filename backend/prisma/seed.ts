import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@clinica.com").toLowerCase().trim();
  const typoPassword = process.env.EED_ADMIN_PASSWORD;
  if (typoPassword && !process.env.SEED_ADMIN_PASSWORD) {
    console.warn(
      "Aviso: EED_ADMIN_PASSWORD en .env es un typo; renombralo a SEED_ADMIN_PASSWORD (se usó igual para el hash)."
    );
  }
  const password = process.env.SEED_ADMIN_PASSWORD ?? typoPassword ?? "Admin123!";
  if (!process.env.SEED_ADMIN_PASSWORD && !typoPassword) {
    console.log("Contraseña del admin (por defecto): Admin123!");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(`Usuario administrador: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
