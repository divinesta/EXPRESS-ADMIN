import { Router } from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { PrismaClient } from "../../generated/prisma/client";
import { hasModelPermission, type AdminOperation } from "../auth/permissions.ts";
import type { FullRegisteredModel } from "../core/registry.ts";
import type { AdminFieldMeta, AdminModelMeta } from "../core/types.ts";
import { applyCreateScope, assertScopeFieldsUnchanged, buildScopedRecordWhere, resolveScope } from "./scope.ts";
import { isFieldVisible, RequestValidationError, validateWritePayload } from "./validation.ts";

// ============================================================
// SCALAR-ONLY CRUD ROUTER
// ============================================================

/** The subset of a Prisma model delegate used by scalar CRUD routes. */
interface PrismaModelDelegate {
   findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
   findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
   count(args: Record<string, unknown>): Promise<number>;
   create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
   updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
   deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
}

function getDelegate(prisma: PrismaClient, meta: AdminModelMeta): PrismaModelDelegate {
   const delegate = (prisma as unknown as Record<string, PrismaModelDelegate | undefined>)[meta.prismaClientKey];
   if (!delegate) throw new Error(`[prisma-express-admin] Prisma client has no delegate for model "${meta.name}".`);
   return delegate;
}

function getAdminUser(req: Request, res: Response) {
   if (!req.adminUser) {
      res.status(401).json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
      return null;
   }

   return req.adminUser;
}

function getRegisteredModel(req: Request, res: Response, models: Map<string, FullRegisteredModel>): FullRegisteredModel | null {
   const modelName = req.params.model;
   const model = typeof modelName === "string" ? models.get(modelName) : undefined;

   if (!model) {
      res.status(404).json({ error: "Model not found", code: "MODEL_NOT_FOUND" });
      return null;
   }

   return model;
}

function authorize(req: Request, res: Response, model: FullRegisteredModel, operation: AdminOperation) {
   const adminUser = getAdminUser(req, res);
   if (!adminUser) return null;

   if (!hasModelPermission(adminUser, model.resolved.permissions, operation)) {
      res.status(403).json({ error: "Permission denied", code: "PERMISSION_DENIED" });
      return null;
   }

   return adminUser;
}

function parseRecordId(meta: AdminModelMeta, rawId: string): string | number {
   const idField = meta.fields.find((field) => field.name === meta.idField);
   if (idField?.type !== "number") return rawId;

   const id = Number(rawId);
   if (!Number.isInteger(id)) throw new RequestValidationError(`Record ID for "${meta.name}" must be an integer.`);
   return id;
}

function getRecordId(req: Request, meta: AdminModelMeta): string | number {
   const rawId = req.params.id;
   if (typeof rawId !== "string") throw new RequestValidationError("Record ID must be a single path parameter.");
   return parseRecordId(meta, rawId);
}

function buildSelect(meta: AdminModelMeta, model: FullRegisteredModel): Record<string, true> {
   return Object.fromEntries(
      meta.fields.filter((field) => field.type !== "relation" && isFieldVisible(field, model.raw)).map((field) => [field.name, true]),
   );
}

function parseListQuery(req: Request, meta: AdminModelMeta, model: FullRegisteredModel) {
   const pageValue = typeof req.query.page === "string" ? Number(req.query.page) : 1;
   if (!Number.isInteger(pageValue) || pageValue < 1) throw new RequestValidationError("Query parameter \"page\" must be a positive integer.");

   const sort = typeof req.query.sort === "string" ? req.query.sort : model.resolved.defaultSort.field;
   const dir = typeof req.query.dir === "string" ? req.query.dir : model.resolved.defaultSort.direction;
   const sortableFields = new Set(meta.fields.filter((field) => field.type !== "relation" && isFieldVisible(field, model.raw)).map((field) => field.name));

   if (!sortableFields.has(sort)) throw new RequestValidationError(`Field "${sort}" cannot be used for sorting.`);
   if (dir !== "asc" && dir !== "desc") throw new RequestValidationError("Query parameter \"dir\" must be either \"asc\" or \"desc\".");

   return { page: pageValue, sort, dir };
}

function sendRouteError(error: unknown, res: Response, next: NextFunction): void {
   if (error instanceof RequestValidationError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
   }

   next(error);
}

function route(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
   return (req, res, next) => {
      void handler(req, res).catch((error: unknown) => sendRouteError(error, res, next));
   };
}

/**
 * Create routes for registered models. Relations, nested writes, and custom
 * actions are deliberately outside this first scalar-only implementation.
 */
export function createCrudRouter(models: Map<string, FullRegisteredModel>, prisma: PrismaClient): Router {
   const router = Router();

   router.get("/:model", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorize(req, res, model, "list");
      if (!adminUser) return;

      const { page, sort, dir } = parseListQuery(req, model.meta, model);
      const scope = await resolveScope(model.raw, adminUser);
      const delegate = getDelegate(prisma, model.meta);
      const select = buildSelect(model.meta, model);
      const perPage = model.resolved.perPage;
      const [records, total] = await Promise.all([
         delegate.findMany({ where: scope, select, orderBy: { [sort]: dir }, skip: (page - 1) * perPage, take: perPage }),
         delegate.count({ where: scope }),
      ]);

      res.json({ records, total, page, perPage, totalPages: Math.ceil(total / perPage) });
   }));

   router.get("/:model/:id", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorize(req, res, model, "view");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      const id = getRecordId(req, model.meta);
      const record = await getDelegate(prisma, model.meta).findFirst({ where: buildScopedRecordWhere(scope, model.meta.idField, id), select: buildSelect(model.meta, model) });

      if (!record) {
         res.status(404).json({ error: "Record not found", code: "RECORD_NOT_FOUND" });
         return;
      }

      res.json(record);
   }));

   router.post("/:model", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorize(req, res, model, "create");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      let data = applyCreateScope(validateWritePayload(model.meta, model.raw, req.body), scope);
      if (model.raw.beforeCreate) data = await model.raw.beforeCreate(data);

      const record = await getDelegate(prisma, model.meta).create({ data, select: buildSelect(model.meta, model) });
      if (model.raw.afterCreate) await model.raw.afterCreate(record);

      res.status(201).json(record);
   }));

   router.put("/:model/:id", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorize(req, res, model, "update");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      const id = getRecordId(req, model.meta);
      let data = validateWritePayload(model.meta, model.raw, req.body);
      assertScopeFieldsUnchanged(data, scope);
      if (model.raw.beforeUpdate) data = await model.raw.beforeUpdate(String(id), data);

      const delegate = getDelegate(prisma, model.meta);
      const result = await delegate.updateMany({ where: buildScopedRecordWhere(scope, model.meta.idField, id), data });
      if (result.count === 0) {
         res.status(404).json({ error: "Record not found", code: "RECORD_NOT_FOUND" });
         return;
      }

      const record = await delegate.findFirst({ where: buildScopedRecordWhere(scope, model.meta.idField, id), select: buildSelect(model.meta, model) });
      if (!record) throw new Error(`[prisma-express-admin] Updated record "${model.meta.name}/${id}" could not be reloaded.`);
      if (model.raw.afterUpdate) await model.raw.afterUpdate(record);

      res.json(record);
   }));

   router.delete("/:model/:id", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorize(req, res, model, "delete");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      const id = getRecordId(req, model.meta);

      const delegate = getDelegate(prisma, model.meta);
      const where = buildScopedRecordWhere(scope, model.meta.idField, id);
      const record = await delegate.findFirst({ where, select: buildSelect(model.meta, model) });
      if (!record) {
         res.status(404).json({ error: "Record not found", code: "RECORD_NOT_FOUND" });
         return;
      }

      if (model.raw.beforeDelete) await model.raw.beforeDelete(String(id));

      const result = await delegate.deleteMany({ where });
      if (result.count === 0) {
         res.status(404).json({ error: "Record not found", code: "RECORD_NOT_FOUND" });
         return;
      }

      if (model.raw.afterDelete) await model.raw.afterDelete(String(id));
      res.status(204).end();
   }));

   return router;
}
