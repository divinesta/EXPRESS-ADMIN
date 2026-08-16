# Wire it into your app

This is the implementation path: one module in **your** codebase, the same shape as [`examples/basic/index.ts`](https://github.com/divinesta/EXPRESS-ADMIN/blob/main/examples/basic/index.ts).

You already [installed](/guide/getting-started) `prisma-express-admin` and can mount with `register("User")`. This page is what you add next so the panel matches how you operate.

## 1. One place to configure the admin

Keep `createAdmin`, every `register`, and `mount` together — `admin.ts` next to your Prisma client, or the bottom of `src/index.ts`.

```ts
import express from "express";
import { createAdmin } from "prisma-express-admin";
import { prisma } from "./prisma.js";

const app = express();

const admin = createAdmin({ /* ... */ });

admin.register("User", { /* ... */ });
admin.register("Post", { /* ... */ });

await admin.mount(app);
```

`register` is synchronous. `mount` is async and must run **after** every `register`. Model names are the Prisma names (`User`, not `users`).

## 2. `createAdmin` — host options

These belong on `createAdmin`, not on each model.

```ts
const admin = createAdmin({
  prisma,
  databaseProvider: "postgresql",
  siteName: "Express Admin",
  schemaPath: "prisma/schema.prisma", // omit if that is already the path
  auth: {
    getCurrentUser: async (req) => {
      const user = await getOperatorFromYourAuth(req);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        isSuperAdmin: user.role === "SUPER_ADMIN",
        tenantId: user.tenantId,
      };
    },
  },
  audit: {
    write: async (event) => {
      await prisma.adminAuditLog.create({
        data: {
          eventType: event.type,
          modelName: event.modelName,
          recordIds: event.recordIds.map(String),
          actorId: event.actor.id,
          actorEmail: event.actor.email,
          actorRole: event.actor.role,
          metadata: event.metadata,
          createdAt: event.timestamp,
        },
      });
    },
  },
});
```

| Option | Why you set it |
| --- | --- |
| `prisma` | Your generated client. Required. |
| `databaseProvider` | `"postgresql"` turns on case-insensitive search. Set your real provider. |
| `siteName` | Header label in the UI. |
| `schemaPath` | Only if `schema.prisma` is not at `prisma/schema.prisma`. |
| `auth.getCurrentUser` | Required. Your session/JWT → [`AdminUser`](/reference/admin-user). |
| `audit.write` | Optional. Called after successful writes. You own the table. |

The example’s `getCurrentUser` looks up a user by `EXAMPLE_ADMIN_EMAIL`. That is **dev-only**. In your app, read the cookie or `Authorization` header. See [Authentication](/guide/auth).

Skip `audit` until you have a place to store events. See [Audit log](/guide/audit).

## 3. `register` — per-model customizations

Second argument to `register` is optional. Every key is optional. This is the object from the example, with each field explained.

### User

```ts
admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive"],
  listFilter: ["role", "isActive"],
  searchFields: ["email", "fullName"],
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
});
```

### Post

```ts
admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
  listFilter: ["published", "createdAt"],
  searchFields: ["title", "content"],
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
  actions: [
    {
      name: "publish_selected",
      label: "Publish selected posts",
      allowedRoles: ["SUPER_ADMIN", "ADMIN"],
      handler: async ({ ids, prisma }) => {
        const result = await prisma.post.updateMany({
          where: { id: { in: ids.map(String) } },
          data: { published: true },
        });
        return { message: `Published ${result.count} posts.` };
      },
    },
  ],
});
```

Put **your** field names in those arrays. They must exist on that Prisma model or `mount` throws.

## 4. What each `register` option does

### `listDisplay` — table columns

```ts
listDisplay: ["email", "fullName", "role", "isActive"];
```

Left-to-right columns on `/admin/users`.

- Use **scalar** names (`email`, `published`) or a **`belongsTo` relation** name (`author`).
- `"author"` on Post shows the related User’s display field (usually `email` or `name`), not a raw UUID.
- Do not put `hasMany` names (`posts` on User). They are not loaded as columns.
- If you omit this, the library picks the display field, more scalars (up to 6), then `createdAt`.

### `searchFields` — the search box

```ts
searchFields: ["email", "fullName"];
```

The list search box runs `contains` across these **string** fields only. `mount` rejects a non-string here.

- Omit it and every non-id string scalar is searched.
- On PostgreSQL, set `databaseProvider: "postgresql"` on `createAdmin` or search is case-sensitive in the Prisma sense.

### `listFilter` — filter controls

```ts
listFilter: ["role", "isActive"];        // User
listFilter: ["published", "createdAt"];  // Post
```

Filters are **opt-in**. If you omit `listFilter`, the UI has no filter sidebar and the API accepts no filter query params.

Good filter fields: enums (`role`), booleans (`isActive`, `published`), date-times (`createdAt`). Date-times become a from/to range.

A name that is not filterable, or not on the model, fails at `mount`.

### `defaultSort` and `perPage`

```ts
defaultSort: { field: "createdAt", direction: "desc" },
perPage: 25,
```

Default sort is `createdAt desc` (or the id). Default page size is **50**.

### `displayField` and `pluralName`

```ts
displayField: "email",  // label in relation dropdowns and titles
pluralName: "people",   // URL becomes /admin/people and /admin/api/people
```

Only set these when the auto-detected values are wrong.

### `fields` — hide, expose, lock

```ts
fields: {
  passwordHash: { exclude: true },
  email: { readOnly: true },
  apiToken: { expose: true, readOnly: true },
},
```

Names matching `password`, `token`, `secret`, `api_key`, `credential`, `private_key` stay hidden until `{ expose: true }`. See [Sensitive fields](/guide/sensitive-fields).

### `scope` — which rows this operator sees

```ts
scope: async (adminUser) =>
  adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
```

Applied to list, detail, update, delete, relation dropdowns, and actions. `{}` means no extra filter. Missing `tenantId` should match **nothing**, not everything.

If you are not multi-tenant, omit `scope`. If you are, this is not optional. See [Multi-tenant scope](/guide/scope).

### `permissions` — who may use which verb

```ts
permissions: {
  list: ["SUPER_ADMIN", "ADMIN"],
  view: ["SUPER_ADMIN", "ADMIN"],
  create: ["SUPER_ADMIN", "ADMIN"],
  update: ["SUPER_ADMIN", "ADMIN"],
  delete: ["SUPER_ADMIN"],
},
```

Omitted keys allow **every authenticated** admin. `delete: []` denies everyone except `isSuperAdmin`. Super-admin skips these lists; it does **not** skip `scope`. See [Permissions](/guide/permissions).

### `actions` — bulk verbs on the list

```ts
actions: [
  {
    name: "publish_selected",
    label: "Publish selected posts",
    allowedRoles: ["SUPER_ADMIN", "ADMIN"],
    handler: async ({ ids, prisma }) => {
      const result = await prisma.post.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { published: true },
      });
      return { message: `Published ${result.count} posts.` };
    },
  },
];
```

`name` is the URL segment. `label` is the button. `ids` are already checked against `scope` — if any id is foreign, the action does not run. Keep the same tenant filter in your `updateMany`. See [Custom actions](/guide/actions).

### Hooks — mutate or block a write

```ts
beforeCreate: async (data) => {
  data.tenantId = currentTenant;
  return data;
},
beforeDelete: async (id) => {
  if (id === ROOT_ID) throw new Error("Cannot delete this user.");
},
```

See [Lifecycle hooks](/guide/hooks).

## 5. Models you should not register

The example schema has `Tenant` and `AdminAuditLog`. They are **not** registered.

- `Tenant` is a join key. Operators should not CRUD companies from this panel unless you want that.
- `AdminAuditLog` is written by `audit.write`. Registering it would make history editable.

Only `register` models operators should see in the sidebar.

## 6. Mount last

```ts
await admin.mount(app);
```

Then listen. Open `/admin`. You should see:

| You set | You see |
| --- | --- |
| `listDisplay` on User | Those columns, in that order |
| `searchFields` | Search box matching email / name |
| `listFilter: ["role", "isActive"]` | Role and active filters |
| `listDisplay: [..., "author"]` on Post | Author email, not `authorId` |
| `scope` | Ada’s tenant only (if you copied the example identities) |
| `actions` | A bulk control on the Post list |

If `mount` throws, read the message — it names the bad model or field.

## Full reference

Every key: [`register()`](/reference/register) and [`createAdmin()`](/reference/create-admin).

Copy-paste host: [Northwind and Contoso](/example/basic).
