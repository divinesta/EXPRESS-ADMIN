import type { ErrorRequestHandler, Response } from "express";

// ============================================================
// API ERRORS
// ============================================================

/** A deliberate, safe error that may be returned to an admin API caller. */
export class AdminApiError extends Error {
   constructor(
      readonly status: number,
      readonly code: string,
      message: string,
   ) {
      super(message);
      this.name = "AdminApiError";
   }
}

export class AuthenticationError extends AdminApiError {
   constructor() {
      super(401, "AUTHENTICATION_REQUIRED", "Authentication required");
      this.name = "AuthenticationError";
   }
}

export class PermissionDeniedError extends AdminApiError {
   constructor() {
      super(403, "PERMISSION_DENIED", "Permission denied");
      this.name = "PermissionDeniedError";
   }
}

export class ModelNotFoundError extends AdminApiError {
   constructor() {
      super(404, "MODEL_NOT_FOUND", "Model not found");
      this.name = "ModelNotFoundError";
   }
}

export class RecordNotFoundError extends AdminApiError {
   constructor() {
      super(404, "RECORD_NOT_FOUND", "Record not found");
      this.name = "RecordNotFoundError";
   }
}

/** Send the stable error shape used by every admin API endpoint. */
export function sendApiError(res: Response, error: AdminApiError): void {
   res.status(error.status).json({ error: error.message, code: error.code });
}

/**
 * Final Express error middleware. Expected errors are safe to expose; unknown
 * failures are intentionally reduced to a generic message.
 */
export const createApiErrorHandler = (): ErrorRequestHandler => (error, _req, res, _next) => {
   if (res.headersSent) return;
   if (error instanceof AdminApiError) {
      sendApiError(res, error);
      return;
   }

   console.error("[prisma-express-admin] Unexpected API error", error);
   res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
};
