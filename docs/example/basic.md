# Northwind and Contoso

`examples/basic/` is the dogfood app in this repository. It is not the library. It is the story the Trust guides keep pointing at.

To copy the same `createAdmin` / `register` options into **your** server, follow [Wire it into your app](/guide/in-your-app).

## What is in it

Prisma models: `User`, `Post`, `Tenant`, `AdminAuditLog`.

Only **User** and **Post** are registered. Tenant is a join key. The audit table is write-only from `audit.write`.

The seed creates application users and tenant data. Administrator accounts are
separate and are created with the superuser command.

## Run it

From the repository root (this is for people cloning the repo, not `npm install` consumers):

```bash
bun install
bun run example:db:up
export DATABASE_URL=postgresql://postgres:postgres@localhost:5435/prisma_express_admin_basic
bun run example:db:generate
bun run example:db:push
bun run example:seed
bun run example:admin:createsuperuser
bun run dev
```

Open `http://localhost:3000/admin/login` and sign in with the superuser you
created.

## What the host actually configures

```ts
const admin = createAdmin({
  prisma,
  databaseProvider: "postgresql",
  siteName: "Express Admins",
  auth: {
    mode: "built-in",
    identifier: "email",
    secureCookies: false,
  },
  audit: { write: async (event) => { /* AdminAuditLog.create */ } },
});

admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive"],
  listFilter: ["role", "isActive"],
  searchFields: ["email", "fullName"],
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
});

admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
  listFilter: ["published", "createdAt"],
  searchFields: ["title", "content"],
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
  actions: [/* publish_selected, unpublish_selected */],
});
```

## What you should see

As a superuser: both tenants, both posts, and both author lists. Create an
`ExpressAdminUser` with role `ADMIN` and a seeded `tenantId` to try the scoped
administrator view.

If any of that fails, `scope` is not on that path. File an issue — that is a security bug, not a missing feature.

## Source

[examples/basic](https://github.com/divinesta/EXPRESS-ADMIN/tree/main/examples/basic) on GitHub.
