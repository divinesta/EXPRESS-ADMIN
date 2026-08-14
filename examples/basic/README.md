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

Open `http://localhost:3000/admin`. The seeded users and posts make it easy to
exercise list, search, filter, detail, create, edit, and delete flows.

The host intentionally uses a local super-admin identity. It is only for this
example; real applications must implement `auth.getCurrentUser` from their own
authentication system.
