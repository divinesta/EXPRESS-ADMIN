# Multi-tenant scope

Scope is the reason this library exists as more than “CRUD from DMMF.”

`scope` returns a Prisma `where` fragment. That fragment is applied to **list, read, update, delete, relation picks, and custom actions** — not only the table.

```ts
admin.register("Post", {
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
});
```

`{}` means no extra filter. Linus uses that path. Ada and Grace get `{ tenantId }`.

## Ada, Grace, Linus

The [basic example](/example/basic) seeds this:

| Person | Email | Role | Tenant |
| --- | --- | --- | --- |
| Ada | `ada@example.test` | `ADMIN` | Northwind |
| Grace | `grace@example.test` | `ADMIN` | Contoso |
| Linus | `linus@example.test` | `SUPER_ADMIN` | Northwind |

Ada opens `/admin/posts` and sees “Welcome to Prisma Express Admin.” She does not see Grace’s Contoso draft. Changing the id in the URL does not help: detail, update, and delete use `AND: [scope, { id }]`. A foreign id is `404 RECORD_NOT_FOUND`, not a leaked row.

Grace has the same `ADMIN` permissions. Different `tenantId` on `AdminUser`. Different rows.

Linus is a super-admin. The example `scope` returns `{}` for him, so he sees both companies. If you forgot that branch, Linus would only see Northwind — **super-admin does not skip scope by itself.**

## Create

Simple equality scopes are written into new records:

```ts
// Ada posts { title, authorId, published }
// The API adds tenantId: northwind
```

If the client sends a conflicting `tenantId`, the request is `400`. Complex Prisma predicates cannot be turned into create data automatically, so models that administrators can create must use simple equality scopes.

## Update

Fields used anywhere in a scope predicate cannot be changed through the admin. This includes a related FK such as `orderId` when the scope contains `order: { tenantId: ... }`.

## Relations and actions

Author dropdowns query `User` under User’s `scope`. Ada cannot assign Grace as author.

Publish-selected reloads the ids under Post’s `scope`. If any id is missing, the action does not run.

## How to write `scope`

```ts
scope: async (adminUser) => {
  if (adminUser.isSuperAdmin) return {};
  if (!adminUser.tenantId) return { tenantId: "__no_tenant__" };
  return { tenantId: adminUser.tenantId };
};
```

The `"__no_tenant__"` fallback is deliberate: a missing tenant id must match **nothing**, not everything.

Put whatever you need on `AdminUser` (`tenantId`, `institutionId`, `metadata`) inside `getCurrentUser`. The library does not infer tenancy from the Prisma schema.

## Mental model

```
permissions  →  may they use this verb?
scope        →  on which rows?
```

Both run on every record operation. Skipping either one is how tenant A sees tenant B.
