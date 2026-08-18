import { Router } from "express";
import type { FullRegisteredModel } from "../core/registry.js";
import type { AdminModelMeta, AuditConfig, PrismaLike } from "../core/types.js";
import { writeAuditEvent } from "./audit.js";
import { RecordNotFoundError, sendApiError } from "./errors.js";
import { buildListWhere, parseListQuery } from "./listQuery.js";
import { assertSelectedRelationsAreVisible, buildListRecordSelect, buildRecordSelect } from "./recordSelection.js";
import { authorizeModelOperation, getRecordId, getRegisteredModel, route } from "./routeSupport.js";
import { applyCreateScope, assertScopeFieldsUnchanged, buildScopedRecordWhere, collectScopeFieldNames, resolveScope } from "./scope.js";
import { assertRequiredCreateFields, RequestValidationError, validateHookPayload, validateWritePayload } from "./validation.js";

/** The subset of a Prisma delegate used by scalar CRUD routes. */
interface PrismaModelDelegate {
   findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
   findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
   count(args: Record<string, unknown>): Promise<number>;
   create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
   updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
   deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
}

function getDelegate(prisma: PrismaLike, meta: AdminModelMeta): PrismaModelDelegate {
   const delegate = (prisma as unknown as Record<string, PrismaModelDelegate | undefined>)[meta.prismaClientKey];
   if (!delegate) throw new Error(`[prisma-express-admin] Prisma client has no delegate for model "${meta.name}".`);
   return delegate;
}

/**
 * Create scalar CRUD routes for registered models. Query parsing, record
 * selection, relation safety, and route plumbing live in focused modules.
 */
export function createCrudRouter(models: Map<string, FullRegisteredModel>, prisma: PrismaLike, databaseProvider?: string, audit?: AuditConfig): Router {
   const router = Router();

   router.get("/:model", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorizeModelOperation(req, res, model, "list");
      if (!adminUser) return;

      const { page, sort, dir, filters, search } = parseListQuery(req, model.meta, model, databaseProvider);
      const scope = await resolveScope(model.raw, adminUser);
      const where = buildListWhere(scope, filters, search);
      const delegate = getDelegate(prisma, model.meta);
      const select = buildListRecordSelect(model.meta, model);
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
      const adminUser = authorizeModelOperation(req, res, model, "view");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      const id = getRecordId(req, model.meta);
      const record = await getDelegate(prisma, model.meta).findFirst({
         where: buildScopedRecordWhere(scope, model.meta.idField, id),
         select: buildRecordSelect(model.meta, model),
      });
      if (!record) {
         sendApiError(res, new RecordNotFoundError());
         return;
      }

      res.json(record);
   }));

   router.post("/:model", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorizeModelOperation(req, res, model, "create");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      let data = applyCreateScope(validateWritePayload(model.meta, model.raw, adminUser, req.body), scope);
      assertRequiredCreateFields(model.meta, model.raw, adminUser, data);
      await assertSelectedRelationsAreVisible(data, model, models, prisma, adminUser);
      if (model.raw.beforeCreate) {
         const hookData = await model.raw.beforeCreate(data);
         const scopeFieldNames = new Set(Object.keys(scope));
         // Scope values are trusted server data. Remove them before validating
         // hook output so a deliberately hidden tenant key can still be
         // injected by applyCreateScope, while a hook cannot overwrite it.
         data = validateHookPayload(model.meta, Object.fromEntries(Object.entries(hookData).filter(([fieldName]) => !scopeFieldNames.has(fieldName))));
         data = applyCreateScope(data, scope);
         assertRequiredCreateFields(model.meta, model.raw, adminUser, data);
         await assertSelectedRelationsAreVisible(data, model, models, prisma, adminUser);
      }

      const record = await getDelegate(prisma, model.meta).create({ data, select: buildRecordSelect(model.meta, model) });
      if (model.raw.afterCreate) await runPostCommit("afterCreate", () => model.raw.afterCreate!(record));
      const recordId = record[model.meta.idField];
      await runPostCommit("audit.write", () => writeAuditEvent(audit, adminUser, {
         type: "create",
         modelName: model.meta.name,
         recordIds: typeof recordId === "string" || typeof recordId === "number" ? [recordId] : [],
      }));
      res.status(201).json(record);
   }));

   router.put("/:model/:id", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorizeModelOperation(req, res, model, "update");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      const id = getRecordId(req, model.meta);
      let data = validateWritePayload(model.meta, model.raw, adminUser, req.body);
      assertScopeFieldsUnchanged(data, scope);
      assertScopeRelationsUnchanged(data, model, scope);
      await assertSelectedRelationsAreVisible(data, model, models, prisma, adminUser);
      if (model.raw.beforeUpdate) {
         data = validateHookPayload(model.meta, await model.raw.beforeUpdate(String(id), data));
         assertScopeFieldsUnchanged(data, scope);
         assertScopeRelationsUnchanged(data, model, scope);
         await assertSelectedRelationsAreVisible(data, model, models, prisma, adminUser);
      }

      const delegate = getDelegate(prisma, model.meta);
      const where = buildScopedRecordWhere(scope, model.meta.idField, id);
      const result = await delegate.updateMany({ where, data });
      if (result.count === 0) {
         sendApiError(res, new RecordNotFoundError());
         return;
      }

      const record = await delegate.findFirst({ where, select: buildRecordSelect(model.meta, model) });
      if (!record) throw new Error(`[prisma-express-admin] Updated record "${model.meta.name}/${id}" could not be reloaded.`);
      if (model.raw.afterUpdate) await runPostCommit("afterUpdate", () => model.raw.afterUpdate!(record));
      await runPostCommit("audit.write", () => writeAuditEvent(audit, adminUser, { type: "update", modelName: model.meta.name, recordIds: [id] }));
      res.json(record);
   }));

   router.delete("/:model/:id", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorizeModelOperation(req, res, model, "delete");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      const id = getRecordId(req, model.meta);
      const delegate = getDelegate(prisma, model.meta);
      const where = buildScopedRecordWhere(scope, model.meta.idField, id);
      const record = await delegate.findFirst({ where, select: buildRecordSelect(model.meta, model) });
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

      if (model.raw.afterDelete) await runPostCommit("afterDelete", () => model.raw.afterDelete!(String(id)));
      await runPostCommit("audit.write", () => writeAuditEvent(audit, adminUser, { type: "delete", modelName: model.meta.name, recordIds: [id] }));
      res.status(204).end();
   }));

   return router;
}

async function runPostCommit(name: string, task: () => Promise<void>): Promise<void> {
   try { await task(); }
   catch { console.error(`[prisma-express-admin] ${name} failed after the database write committed.`); }
}

/** A nested scope such as `{ order: { tenantId } }` controls `orderId` too. */
function assertScopeRelationsUnchanged(data: Record<string, unknown>, model: FullRegisteredModel, scope: Record<string, unknown>): void {
   const referencedNames = collectScopeFieldNames(scope);
   for (const field of model.meta.fields) {
      const relation = field.relation;
      if (field.type !== "relation" || relation?.kind !== "belongsTo" || !referencedNames.has(field.name)) continue;
      for (const foreignKeyField of relation.foreignKeyFields) {
         if (data[foreignKeyField] !== undefined) throw new RequestValidationError(`Field "${foreignKeyField}" is controlled by the configured scope and cannot be updated through the admin.`);
      }
   }
}
