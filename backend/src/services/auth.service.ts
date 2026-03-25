import { Role } from "@prisma/client";
import { userRepository } from "../repositories/user.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { signToken } from "../utils/jwt.js";
import { verifyPassword } from "../utils/password.js";

export async function getCurrentUser(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError(404, "Usuario no encontrado");
  }
  if (user.role === Role.SPECIALIST && (!user.specialist || !user.specialist.active)) {
    throw new AppError(403, "Cuenta de especialista inactiva");
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    specialistId: user.specialist?.id ?? null,
    specialist: user.specialist
      ? {
          id: user.specialist.id,
          firstName: user.specialist.firstName,
          lastName: user.specialist.lastName,
          specialty: user.specialist.specialty,
        }
      : null,
  };
}

export async function login(email: string, password: string) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new AppError(401, "Credenciales inválidas");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new AppError(401, "Credenciales inválidas");
  }
  if (user.role === Role.SPECIALIST) {
    if (!user.specialist || !user.specialist.active) {
      throw new AppError(403, "Cuenta de especialista inactiva");
    }
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    specialistId: user.specialist?.id ?? null,
  });

  const sessionUser = await getCurrentUser(user.id);

  return {
    token,
    user: sessionUser,
  };
}
