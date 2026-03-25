import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env.js";
import type { JwtPayloadUser } from "../types/express.js";

export function signToken(payload: JwtPayloadUser): string {
  return jwt.sign(
    {
      sub: payload.sub,
      role: payload.role,
      specialistId: payload.specialistId,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
  );
}

export function verifyToken(token: string): JwtPayloadUser {
  const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & {
    sub: string;
    role: Role;
    specialistId: string | null;
  };
  return {
    sub: decoded.sub,
    role: decoded.role,
    specialistId: decoded.specialistId ?? null,
  };
}
