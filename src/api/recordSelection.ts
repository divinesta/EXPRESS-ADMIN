import { hasModelPermission } from "../auth/permissions.js";
import type { FullRegisteredModel } from "../core/registry.js";
import type { AdminModelMeta, AdminUser, PrismaLike } from "../core/types.js";
import { buildScopedRecordWhere, resolveScope } from "./scope.js";
import { parseRecordId } from "./routeSupport.js";
import { isFieldVisible, isSensitiveFieldName, RequestValidationError } from "./validation.js";
import { PermissionDeniedError } from "./errors.js";

interface SelectionDelegate {
   findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}

function getDelegate(prisma: PrismaLike, meta: AdminModelMeta): SelectionDelegate {
   const delegate = (prisma as unknown as Record<string, SelectionDelegate | undefined>)[meta.prismaClientKey];
   if (!delegate) throw new Error(`[prisma-express-admin] Prisma client has no delegate for model "${meta.name}".`);
   return delegate;
}

/** Build the smallest safe Prisma select needed for detail and list records. */
export function buildRecordSelect(meta: AdminModelMeta, model: FullRegisteredModel): Record<string, true | { select: Record<string, true> }> {
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

/** Verify submitted belongs-to IDs are visible under the related model's own access rules. */
export async function assertSelectedRelationsAreVisible(
   data: Record<string, unknown>,
   model: FullRegisteredModel,
   models: Map<string, FullRegisteredModel>,
   prisma: PrismaLike,
   adminUser: AdminUser,
): Promise<void> {
   const modelsByName = new Map([...models.values()].map((candidate) => [candidate.meta.name, candidate]));

   for (const relationField of model.meta.fields) {
      const relation = relationField.relation;
      if (relationField.type !== "relation" || relation?.kind !== "belongsTo" || relation.foreignKeyFields.length !== 1) continue;

      const foreignKeyField = relation.foreignKeyFields[0];
      if (!foreignKeyField || !(foreignKeyField in data)) continue;
      const selectedId = data[foreignKeyField];
      if (selectedId === null) continue;

      const relatedModel = modelsByName.get(relation.model);
      if (!relatedModel) continue;
      if (!hasModelPermission(adminUser, relatedModel.resolved.permissions, "list")) throw new PermissionDeniedError();

      const relatedScope = await resolveScope(relatedModel.raw, adminUser);
      const relatedRecord = await getDelegate(prisma, relatedModel.meta).findFirst({
         where: buildScopedRecordWhere(relatedScope, relatedModel.meta.idField, parseRecordId(relatedModel.meta, String(selectedId))),
         select: { [relatedModel.meta.idField]: true },
      });
      if (!relatedRecord) throw new RequestValidationError(`The selected ${relation.model} record is unavailable.`);
   }
}
