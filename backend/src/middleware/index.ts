/**
 * Middleware de la aplicación.
 * - Autenticación: `requireAuth` valida JWT.
 * - Roles: `requireRole(...roles)` restringe por rol (ADMIN | SPECIALIST).
 */
export { requireAuth, requireRole } from "./auth.js";
export { AppError, errorHandler } from "./errorHandler.js";
