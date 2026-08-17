# Basic example

This is the local dogfood application for Prisma Express Admin. It owns its
Express host, Prisma schema, generated client, local database definition, and
repeatable sample data.

## Run it

From the repository root:

```bash
bun install
bun run example:db:up
export DATABASE_URL=postgresql://postgres:postgres@localhost:5435/prisma_express_admin_basic
bun run example:db:generate
bun run example:db:push
bun run example:seed
bun run dev
```

Open `http://localhost:3000/admin`. The repeatable seed creates three tenants,
72 users, 60 customers, 36 categories, 120 products, 120 posts, 90 orders,
and their order items. It is safe to run again: it replaces only records that
belong to the three deterministic example tenants.

This gives the admin enough data to exercise list pagination, search, filters,
detail and create views, enum fields, tenant-scoped relation selection, custom
actions, and audit logging.

## Try the tenant boundaries

The host reads `EXAMPLE_ADMIN_EMAIL` to select a development identity. Restart
the host with one of these values after seeding:

```bash
EXAMPLE_ADMIN_EMAIL=ada@example.test bun run dev
EXAMPLE_ADMIN_EMAIL=grace@example.test bun run dev
EXAMPLE_ADMIN_EMAIL=linus@example.test bun run dev
```

- Ada is a Northwind admin and sees only Northwind users and posts.
- Grace is a Contoso admin and sees only Contoso users and posts.
- Linus is a super-admin and sees both tenants.

The server applies this boundary through each registered model's `scope()`;
changing a request in the browser cannot bypass it. Creating a Post assigns the
current tenant automatically, relation choices are limited to that tenant, and
custom actions are rechecked under the same scope.

Every successful create, update, delete, or custom action writes an
append-only `AdminAuditLog` record. The example intentionally does not expose
that log as an admin model, so it remains an operational record rather than a
user-editable resource.

These identities are development-only. Real applications must implement
`auth.getCurrentUser` from their own authentication system.
