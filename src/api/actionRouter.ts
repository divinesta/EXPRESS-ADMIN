import { Router } from "express";
import { hasModelPermission, hasRegisteredActionPermission } from "../auth/permissions.js";
import { DELETE_SELECTED_ACTION } from "../core/defaultActions.js";
import type { FullRegisteredModel } from "../core/registry.js";
import type { AdminModelMeta, AuditConfig, PrismaLike } from "../core/types.js";
import { writeAuditEvent } from "./audit.js";
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

/** Create scoped, permission-aware routes for registered list-view actions. */
export function createActionRouter(models: Map<string, FullRegisteredModel>, prisma: PrismaLike, audit?: AuditConfig): Router {
   const router = Router();

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
            for (const id of ids) {
               if (model.raw.beforeDelete) await model.raw.beforeDelete(String(id));
            }
            const result = await delegate.deleteMany({ where });
            if (result.count !== ids.length) throw new RequestValidationError("One or more selected records are unavailable.");
            for (const id of ids) {
               if (model.raw.afterDelete) await model.raw.afterDelete(String(id));
            }
            await writeAuditEvent(audit, adminUser, { type: "delete", modelName: model.meta.name, recordIds: ids });
            res.json({ message: `Deleted ${ids.length} ${ids.length === 1 ? "record" : "records"}.` });
            return;
         }

         if (!action) throw new Error(`Action "${String(actionName)}" was not found.`);
         const result = await action.handler({ ids, adminUser, prisma });
         await writeAuditEvent(audit, adminUser, {
            type: "action",
            modelName: model.meta.name,
            recordIds: ids,
            metadata: { action: action.name },
         });
         res.json(result);
   }));

   return router;
}
