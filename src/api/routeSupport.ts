import type { NextFunction, Request, RequestHandler, Response } from "express";
import { hasModelPermission, type AdminOperation } from "../auth/permissions.js";
import type { FullRegisteredModel } from "../core/registry.js";
import type { AdminModelMeta, AdminUser } from "../core/types.js";
import { AdminApiError, AuthenticationError, ModelNotFoundError, PermissionDeniedError, sendApiError } from "./errors.js";
import { RequestValidationError } from "./validation.js";

/** Wrap an async Express handler and pass unexpected failures to error middleware. */
export function route(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
   return (req, res, next) => {
      void handler(req, res).catch((error: unknown) => sendRouteError(error, res, next));
   };
}

/** Send deliberate API errors directly; preserve Express's handling for all others. */
export function sendRouteError(error: unknown, res: Response, next: NextFunction): void {
   if (error instanceof AdminApiError) {
      sendApiError(res, error);
      return;
   }

   next(error);
}

export function getAdminUser(req: Request, res: Response): AdminUser | null {
   if (!req.adminUser) {
      sendApiError(res, new AuthenticationError());
      return null;
   }

   return req.adminUser;
}

export function getRegisteredModel(req: Request, res: Response, models: Map<string, FullRegisteredModel>): FullRegisteredModel | null {
   const modelName = req.params.model;
   const model = typeof modelName === "string" ? models.get(modelName) : undefined;

   if (!model) {
      sendApiError(res, new ModelNotFoundError());
      return null;
   }

   return model;
}

export function authorizeModelOperation(req: Request, res: Response, model: FullRegisteredModel, operation: AdminOperation): AdminUser | null {
   const adminUser = getAdminUser(req, res);
   if (!adminUser) return null;

   if (!hasModelPermission(adminUser, model.resolved.permissions, operation)) {
      sendApiError(res, new PermissionDeniedError());
      return null;
   }

   return adminUser;
}

export function parseRecordId(meta: AdminModelMeta, rawId: string): string | number {
   const idField = meta.fields.find((field) => field.name === meta.idField);
   if (idField?.type !== "number") return rawId;

   if (!/^-?(?:0|[1-9]\d*)$/.test(rawId)) throw new RequestValidationError(`Record ID for "${meta.name}" must be an integer.`);
   const id = Number(rawId);
   if (!Number.isSafeInteger(id)) throw new RequestValidationError(`Record ID for "${meta.name}" must be a safe integer.`);
   return id;
}

export function getRecordId(req: Request, meta: AdminModelMeta): string | number {
   const rawId = req.params.id;
   if (typeof rawId !== "string") throw new RequestValidationError("Record ID must be a single path parameter.");
   return parseRecordId(meta, rawId);
}
