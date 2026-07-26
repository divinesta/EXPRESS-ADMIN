import { Router } from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { PrismaClient } from "../../generated/prisma/client";
import { hasModelPermission, type AdminOperation } from "../auth/permissions.ts";
import type { FullRegisteredModel } from "../core/registry.ts";
import type { AdminFieldMeta, AdminModelMeta } from "../core/types.ts";
import { applyCreateScope, assertScopeFieldsUnchanged, buildScopedRecordWhere, resolveScope } from "./scope.ts";
import { isFieldVisible, isSensitiveFieldName, RequestValidationError, validateWritePayload } from "./validation.ts";
import { AdminApiError, AuthenticationError, ModelNotFoundError, PermissionDeniedError, RecordNotFoundError, sendApiError } from "./errors.ts";

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
      sendApiError(res, new AuthenticationError());
      return null;
   }

   return req.adminUser;
}

function getRegisteredModel(req: Request, res: Response, models: Map<string, FullRegisteredModel>): FullRegisteredModel | null {
   const modelName = req.params.model;
   const model = typeof modelName === "string" ? models.get(modelName) : undefined;

   if (!model) {
      sendApiError(res, new ModelNotFoundError());
      return null;
   }

   return model;
}

function authorize(req: Request, res: Response, model: FullRegisteredModel, operation: AdminOperation) {
   const adminUser = getAdminUser(req, res);
   if (!adminUser) return null;

   if (!hasModelPermission(adminUser, model.resolved.permissions, operation)) {
      sendApiError(res, new PermissionDeniedError());
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

function buildSelect(meta: AdminModelMeta, model: FullRegisteredModel): Record<string, true | { select: Record<string, true> }> {
   const select: Record<string, true | { select: Record<string, true> }> = Object.fromEntries(
      meta.fields.filter((field) => field.type !== "relation" && isFieldVisible(field, model.raw)).map((field) => [field.name, true]),
   );

   for (const fieldName of model.resolved.listDisplay) {
      const field = meta.fields.find((candidate) => candidate.name === fieldName);
      if (!field?.relation || !isFieldVisible(field, model.raw)) continue;
      if (field.relation.kind !== "belongsTo" && field.relation.kind !== "hasOne") continue;
      if (isSensitiveFieldName(field.relation.displayField)) continue;

      select[field.name] = { select: { [field.relation.displayField]: true } };
   }

   return select;
}

function getQueryValue(req: Request, name: string): string | undefined {
   const value = req.query[name];
   if (value === undefined) return undefined;
   if (typeof value !== "string") throw new RequestValidationError(`Query parameter "${name}" must be a single string value.`);
   return value;
}

function parseFilterValue(field: AdminFieldMeta, value: string): string | number | boolean | Date {
   switch (field.type) {
      case "string":
      case "bytes":
         return value;
      case "number": {
         const number = Number(value);
         if (!Number.isFinite(number)) throw new RequestValidationError(`Filter "${field.name}" must be a finite number.`);
         return number;
      }
      case "boolean":
         if (value !== "true" && value !== "false") throw new RequestValidationError(`Filter "${field.name}" must be "true" or "false".`);
         return value === "true";
      case "datetime": {
         const date = new Date(value);
         if (Number.isNaN(date.getTime())) throw new RequestValidationError(`Filter "${field.name}" must be an ISO date-time value.`);
         return date;
      }
      case "enum":
         if (!field.enumValues?.includes(value)) throw new RequestValidationError(`Filter "${field.name}" must be a valid ${field.prismaType} value.`);
         return value;
      case "json":
      case "relation":
         throw new RequestValidationError(`Filter "${field.name}" is not supported.`);
   }
}

function buildListWhere(scope: Record<string, unknown>, filters: Record<string, unknown>, search: Record<string, unknown> | undefined): Record<string, unknown> {
   const conditions = [scope, filters, search].filter((condition): condition is Record<string, unknown> => condition !== undefined && Object.keys(condition).length > 0);
   if (conditions.length === 0) return {};
   if (conditions.length === 1) return conditions[0] ?? {};
   return { AND: conditions };
}

function parseListQuery(req: Request, meta: AdminModelMeta, model: FullRegisteredModel, databaseProvider?: string) {
   const pageValue = Number(getQueryValue(req, "page") ?? 1);
   if (!Number.isInteger(pageValue) || pageValue < 1) throw new RequestValidationError("Query parameter \"page\" must be a positive integer.");

   const sort = getQueryValue(req, "sort") ?? model.resolved.defaultSort.field;
   const dir = getQueryValue(req, "dir") ?? model.resolved.defaultSort.direction;
   const sortableFields = new Set(meta.fields.filter((field) => field.type !== "relation" && isFieldVisible(field, model.raw)).map((field) => field.name));

   if (!sortableFields.has(sort)) throw new RequestValidationError(`Field "${sort}" cannot be used for sorting.`);
   if (dir !== "asc" && dir !== "desc") throw new RequestValidationError("Query parameter \"dir\" must be either \"asc\" or \"desc\".");

   const fieldsByName = new Map(meta.fields.map((field) => [field.name, field]));
   const filterableFields = new Set(model.resolved.listFilter.filter((fieldName) => {
      const field = fieldsByName.get(fieldName);
      return field !== undefined && field.type !== "relation" && isFieldVisible(field, model.raw);
   }));
   const filters: Record<string, unknown> = {};
   const knownQueryParameters = new Set(["page", "sort", "dir", "search"]);

   for (const [parameterName, rawValue] of Object.entries(req.query)) {
      if (knownQueryParameters.has(parameterName)) continue;
      if (typeof rawValue !== "string") throw new RequestValidationError(`Query parameter "${parameterName}" must be a single string value.`);

      const rangeMatch = /^(.*)_(gte|lte)$/.exec(parameterName);
      const fieldName = rangeMatch?.[1] ?? parameterName;
      const field = fieldsByName.get(fieldName);
      if (!field || !filterableFields.has(fieldName)) throw new RequestValidationError(`Filter "${parameterName}" is not allowed for this model.`);

      if (rangeMatch) {
         if (field.type !== "datetime") throw new RequestValidationError(`Filter "${parameterName}" is only supported for date-time fields.`);
         const operator = rangeMatch[2];
         if (!operator) throw new RequestValidationError(`Filter "${parameterName}" is invalid.`);
         filters[fieldName] = { ...(filters[fieldName] as Record<string, unknown> | undefined), [operator]: parseFilterValue(field, rawValue) };
      } else {
         filters[fieldName] = parseFilterValue(field, rawValue);
      }
   }

   const searchValue = getQueryValue(req, "search")?.trim();
   if (searchValue && searchValue.length > 200) throw new RequestValidationError("Query parameter \"search\" must be 200 characters or fewer.");
   const searchFields = model.resolved.searchFields.filter((fieldName) => {
      const field = fieldsByName.get(fieldName);
      return field?.type === "string" && isFieldVisible(field, model.raw);
   });
   const search = searchValue ? {
      OR: searchFields.map((fieldName) => ({
         [fieldName]: { contains: searchValue, ...(databaseProvider === "postgresql" ? { mode: "insensitive" } : {}) },
      })),
   } : undefined;

   if (searchValue && searchFields.length === 0) throw new RequestValidationError(`Model "${meta.name}" has no searchable fields.`);

   return { page: pageValue, sort, dir, filters, search };
}

function sendRouteError(error: unknown, res: Response, next: NextFunction): void {
   if (error instanceof AdminApiError) {
      sendApiError(res, error);
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
export function createCrudRouter(models: Map<string, FullRegisteredModel>, prisma: PrismaClient, databaseProvider?: string): Router {
   const router = Router();

   router.get("/:model", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorize(req, res, model, "list");
      if (!adminUser) return;

      const { page, sort, dir, filters, search } = parseListQuery(req, model.meta, model, databaseProvider);
      const scope = await resolveScope(model.raw, adminUser);
      const where = buildListWhere(scope, filters, search);
      const delegate = getDelegate(prisma, model.meta);
      const select = buildSelect(model.meta, model);
      const perPage = model.resolved.perPage;
      const [records, total] = await Promise.all([
         delegate.findMany({ where, select, orderBy: { [sort]: dir }, skip: (page - 1) * perPage, take: perPage }),
         delegate.count({ where }),
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
         sendApiError(res, new RecordNotFoundError());
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
         sendApiError(res, new RecordNotFoundError());
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
         sendApiError(res, new RecordNotFoundError());
         return;
      }

      if (model.raw.beforeDelete) await model.raw.beforeDelete(String(id));

      const result = await delegate.deleteMany({ where });
      if (result.count === 0) {
         sendApiError(res, new RecordNotFoundError());
         return;
      }

      if (model.raw.afterDelete) await model.raw.afterDelete(String(id));
      res.status(204).end();
   }));

   return router;
}
