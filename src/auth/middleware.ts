import type { RequestHandler } from "express";
import type { AdminUser, AuthConfig } from "../core/types.ts";
import { AuthenticationError, sendApiError } from "../api/errors.ts";

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

/**
 * Verify that a value returned by the host application's auth adapter has
 * the minimum shape needed by the admin. This prevents malformed adapters
 * from creating a partially authenticated request.
 */
function isAdminUser(value: unknown): value is AdminUser {
   if (typeof value !== "object" || value === null) return false;

   const user = value as Record<string, unknown>;
   return typeof user.id === "string" && typeof user.email === "string" && typeof user.role === "string" && typeof user.isSuperAdmin === "boolean";
}

/**
 * Create middleware that resolves the current admin user for every protected
 * request. The host application owns credential verification; this library
 * only turns its result into a trusted request context.
 */
export function createAuthenticationMiddleware(auth: AuthConfig): RequestHandler {
   return async (req, res, next) => {
      try {
         const adminUser = await auth.getCurrentUser(req);

         if (!isAdminUser(adminUser)) {
            sendApiError(res, new AuthenticationError());
            return;
         }

         req.adminUser = adminUser;
         next();
      } catch {
         // Do not expose authentication-adapter failures to a caller.
         sendApiError(res, new AuthenticationError());
      }
   };
}
