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
bun run example:admin:createsuperuser
bun run dev
```

Open `http://localhost:3000/admin/login` and sign in with the superuser you just created. The repeatable seed creates three tenants,
72 users, 60 customers, 36 categories, 120 products, 120 posts, 90 orders,
and their order items. It is safe to run again: it replaces only records that
belong to the three deterministic example tenants.

This gives the admin enough data to exercise list pagination, search, filters,
detail and create views, enum fields, tenant-scoped relation selection, custom
actions, and audit logging.

## Try the tenant boundaries

A created superuser sees every tenant. Create an `ExpressAdminUser` with role
`ADMIN` and a `tenantId` matching one of the seeded tenants to test tenant-scoped
views. The account signs in through `/admin/login` using its own admin password.

The server applies this boundary through each registered model's `scope()`;
changing a request in the browser cannot bypass it. Creating a Post assigns the
current tenant automatically, relation choices are limited to that tenant, and
custom actions are rechecked under the same scope.

Every successful create, update, delete, or custom action writes an
append-only `AdminAuditLog` record. The example intentionally does not expose
that log as an admin model, so it remains an operational record rather than a
user-editable resource.

The example uses built-in admin-only authentication. Its customer-facing `User`
records are not used for administrator login.
