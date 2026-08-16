import { Router } from "express";
import type { FullRegisteredModel } from "../core/registry.js";
import type { AdminModelMeta, PrismaLike } from "../core/types.js";
import { RecordNotFoundError, sendApiError } from "./errors.js";
import { buildListWhere, parseListQuery } from "./listQuery.js";
import { assertSelectedRelationsAreVisible, buildRecordSelect } from "./recordSelection.js";
import { authorizeModelOperation, getRecordId, getRegisteredModel, route } from "./routeSupport.js";
import { applyCreateScope, assertScopeFieldsUnchanged, buildScopedRecordWhere, resolveScope } from "./scope.js";
import { validateWritePayload } from "./validation.js";

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
export function createCrudRouter(models: Map<string, FullRegisteredModel>, prisma: PrismaLike, databaseProvider?: string): Router {
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
      const select = buildRecordSelect(model.meta, model);
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
      let data = applyCreateScope(validateWritePayload(model.meta, model.raw, req.body), scope);
      await assertSelectedRelationsAreVisible(data, model, models, prisma, adminUser);
      if (model.raw.beforeCreate) data = await model.raw.beforeCreate(data);

      const record = await getDelegate(prisma, model.meta).create({ data, select: buildRecordSelect(model.meta, model) });
      if (model.raw.afterCreate) await model.raw.afterCreate(record);
      res.status(201).json(record);
   }));

   router.put("/:model/:id", route(async (req, res) => {
      const model = getRegisteredModel(req, res, models);
      if (!model) return;
      const adminUser = authorizeModelOperation(req, res, model, "update");
      if (!adminUser) return;

      const scope = await resolveScope(model.raw, adminUser);
      const id = getRecordId(req, model.meta);
      let data = validateWritePayload(model.meta, model.raw, req.body);
      assertScopeFieldsUnchanged(data, scope);
      await assertSelectedRelationsAreVisible(data, model, models, prisma, adminUser);
      if (model.raw.beforeUpdate) data = await model.raw.beforeUpdate(String(id), data);

      const delegate = getDelegate(prisma, model.meta);
      const where = buildScopedRecordWhere(scope, model.meta.idField, id);
      const result = await delegate.updateMany({ where, data });
      if (result.count === 0) {
         sendApiError(res, new RecordNotFoundError());
         return;
      }

      const record = await delegate.findFirst({ where, select: buildRecordSelect(model.meta, model) });
      if (!record) throw new Error(`[prisma-express-admin] Updated record "${model.meta.name}/${id}" could not be reloaded.`);
      if (model.raw.afterUpdate) await model.raw.afterUpdate(record);
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

      if (model.raw.afterDelete) await model.raw.afterDelete(String(id));
      res.status(204).end();
   }));

   return router;
}
