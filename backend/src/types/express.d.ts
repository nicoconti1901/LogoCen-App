import type { Role } from "@prisma/client";

export type JwtPayloadUser = {
  sub: string;
  role: Role;
  specialistId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayloadUser;
      file?: Multer.File;
    }
  }
}

export {};
