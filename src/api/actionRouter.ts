import { Router } from "express";
import { hasModelPermission, hasRegisteredActionPermission } from "../auth/permissions.js";
import { DELETE_SELECTED_ACTION } from "../core/defaultActions.js";
import type { FullRegisteredModel } from "../core/registry.js";
import type { AdminModelMeta, AuditConfig, PrismaLike } from "../core/types.js";
import { writeAuditEvent } from "./audit.js";
import { buildListRecordSelect } from "./recordSelection.js";
import { PermissionDeniedError, sendApiError } from "./errors.js";
import { getAdminUser, getRegisteredModel, parseRecordId, route } from "./routeSupport.js";
import { resolveScope } from "./scope.js";
import { RequestValidationError } from "./validation.js";

type ActionDelegate = {
   findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
   deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
};

const MAX_ACTION_RECORDS = 100;

function getDelegate(prisma: PrismaLike, meta: AdminModelMeta): ActionDelegate {
   const delegate = (prisma as Record<string, ActionDelegate | undefined>)[meta.prismaClientKey];
   if (!delegate) throw new Error(`[prisma-express-admin] Prisma client has no delegate for model "${meta.name}".`);
   return delegate;
}

function parseIds(meta: AdminModelMeta, body: unknown): Array<string | number> {
   if (typeof body !== "object" || body === null || Array.isArray(body)) throw new RequestValidationError("Request body must be a JSON object.");
   const ids = (body as Record<string, unknown>).ids;
   if (!Array.isArray(ids) || ids.length === 0) throw new RequestValidationError("Action requests require at least one record ID.");
   if (ids.length > MAX_ACTION_RECORDS) throw new RequestValidationError(`Actions can target at most ${MAX_ACTION_RECORDS} records at once.`);

   const parsed = ids.map((raw) => {
      if (typeof raw !== "string" && typeof raw !== "number") throw new RequestValidationError("Every action record ID must be a string or number.");
      return parseRecordId(meta, String(raw));
   });

   if (new Set(parsed).size !== parsed.length) throw new RequestValidationError("Action record IDs must be unique.");
   return parsed;
}

function parseIdsQuery(meta: AdminModelMeta, rawIds: unknown): Array<string | number> {
   const ids = Array.isArray(rawIds) ? rawIds.flatMap((value) => String(value).split(",")) : typeof rawIds === "string" ? rawIds.split(",") : [];
   return parseIds(meta, { ids: ids.map((value) => value.trim()).filter(Boolean) });
}

function findCascadeChildRelation(parent: FullRegisteredModel, child: FullRegisteredModel, relationName: string) {
   return child.meta.fields.find((field) => {
      const relation = field.relation;
      return field.type === "relation"
         && relation?.kind === "belongsTo"
         && relation.model === parent.meta.name
         && relation.relationName === relationName
         && relation.foreignKeyFields.length === 1
         && relation.onDelete === "Cascade";
   });
}

/** Create scoped, permission-aware routes for registered list-view actions. */
export function createActionRouter(models: Map<string, FullRegisteredModel>, prisma: PrismaLike, audit?: AuditConfig): Router {
   const router = Router();

   router.get("/:model/actions/delete-preview", route(async (req, res) => {
         const adminUser = getAdminUser(req, res);
         if (!adminUser) return;
         const model = getRegisteredModel(req, res, models);
         if (!model) return;
         if (!hasModelPermission(adminUser, model.resolved.permissions, "delete")) {
            sendApiError(res, new PermissionDeniedError());
            return;
         }

         const requestedIds = parseIdsQuery(model.meta, req.query.ids);
         const scope = await resolveScope(model.raw, adminUser);
         const delegate = getDelegate(prisma, model.meta);
         const parentSelect = buildListRecordSelect(model.meta, model);
         const parentRecords = await delegate.findMany({
            where: { AND: [scope, { [model.meta.idField]: { in: requestedIds } }] },
            select: parentSelect,
         });
         const ids = parentRecords.map((record) => record[model.meta.idField]).filter((id): id is string | number => typeof id === "string" || typeof id === "number");
         if (ids.length !== requestedIds.length) throw new RequestValidationError("One or more selected records are unavailable.");

         const relations = [];
         const modelsByName = new Map([...models.values()].map((entry) => [entry.meta.name, entry]));
         for (const relationField of model.meta.fields) {
            const relation = relationField.relation;
            if (relationField.type !== "relation" || relation?.kind !== "hasMany") continue;
            const childModel = modelsByName.get(relation.model);
            if (!childModel || !hasModelPermission(adminUser, childModel.resolved.permissions, "list")) continue;
            const childRelationField = findCascadeChildRelation(model, childModel, relation.relationName);
            const childForeignKey = childRelationField?.relation?.foreignKeyFields[0];
            if (!childForeignKey) continue;

            const childScope = await resolveScope(childModel.raw, adminUser);
            const childSelect = { ...buildListRecordSelect(childModel.meta, childModel), [childForeignKey]: true };
            const childRecords = await getDelegate(prisma, childModel.meta).findMany({
               where: { AND: [childScope, { [childForeignKey]: { in: ids } }] },
               select: childSelect,
            });
            const recordsByParentId: Record<string, Record<string, unknown>[]> = {};
            for (const record of childRecords) {
               const parentId = record[childForeignKey];
               if (typeof parentId !== "string" && typeof parentId !== "number") continue;
               const key = String(parentId);
               recordsByParentId[key] = [...(recordsByParentId[key] ?? []), record];
            }
            relations.push({
               fieldName: relationField.name,
               modelName: childModel.meta.name,
               pluralName: childModel.meta.pluralName,
               idField: childModel.meta.idField,
               displayField: childModel.meta.displayField,
               recordsByParentId,
            });
         }

         res.json({ records: parentRecords, relations });
   }));

   router.post("/:model/actions/:action", route(async (req, res) => {
         const adminUser = getAdminUser(req, res);
         if (!adminUser) return;
         const model = getRegisteredModel(req, res, models);
         if (!model) return;
         if (!hasModelPermission(adminUser, model.resolved.permissions, "list")) {
            sendApiError(res, new PermissionDeniedError());
            return;
         }

         const actionName = req.params.action;
         const isDeleteAction = actionName === DELETE_SELECTED_ACTION.name;
         const action = typeof actionName === "string" ? model.raw.actions?.find((candidate) => candidate.name === actionName) : undefined;
         if (isDeleteAction && !hasModelPermission(adminUser, model.resolved.permissions, "delete")) {
            sendApiError(res, new PermissionDeniedError());
            return;
         }
         if (!isDeleteAction && (!action || !hasRegisteredActionPermission(adminUser, model.resolved.permissions, action))) {
            sendApiError(res, new PermissionDeniedError());
            return;
         }

         const requestedIds = parseIds(model.meta, req.body);
         const scope = await resolveScope(model.raw, adminUser);
         const delegate = getDelegate(prisma, model.meta);
         const where = { AND: [scope, { [model.meta.idField]: { in: requestedIds } }] };
         const records = await delegate.findMany({
            where,
            select: { [model.meta.idField]: true },
         });
         const ids = records.map((record) => record[model.meta.idField]).filter((id): id is string | number => typeof id === "string" || typeof id === "number");
         if (ids.length !== requestedIds.length) throw new RequestValidationError("One or more selected records are unavailable.");

         if (isDeleteAction) {
            const deletedIds: Array<string | number> = [];
            for (const id of ids) {
               if (model.raw.beforeDelete) await model.raw.beforeDelete(String(id));
               const result = await delegate.deleteMany({ where: { AND: [scope, { [model.meta.idField]: id }] } });
               if (result.count !== 1) continue;
               deletedIds.push(id);
               if (model.raw.afterDelete) await runPostCommit("afterDelete", () => model.raw.afterDelete!(String(id)));
            }
            if (deletedIds.length > 0) await writeAuditSafely(audit, adminUser, { type: "delete", modelName: model.meta.name, recordIds: deletedIds });
            const partial = deletedIds.length !== ids.length;
            res.json({ message: partial ? `Deleted ${deletedIds.length} ${deletedIds.length === 1 ? "record" : "records"}; some records changed before deletion.` : `Deleted ${deletedIds.length} ${deletedIds.length === 1 ? "record" : "records"}.` });
            return;
         }

         if (!action) throw new Error(`Action "${String(actionName)}" was not found.`);
         // `where` must be used for every mutation in a custom action. It
         // contains both the scope and selected IDs, so it remains safe if a
         // record changes between the initial selection and the mutation.
         const result = await action.handler({ ids, adminUser, prisma, where });
         await writeAuditSafely(audit, adminUser, {
            type: "action",
            modelName: model.meta.name,
            recordIds: ids,
            metadata: { action: action.name },
         });
         res.json(result);
   }));

   return router;
}

async function runPostCommit(name: string, task: () => Promise<void>): Promise<void> {
   try { await task(); }
   catch { console.error(`[prisma-express-admin] ${name} failed after the database write committed.`); }
}

async function writeAuditSafely(audit: AuditConfig | undefined, actor: import("../core/types.js").AdminUser, event: Parameters<typeof writeAuditEvent>[2]): Promise<void> {
   await runPostCommit("audit.write", () => writeAuditEvent(audit, actor, event));
}
