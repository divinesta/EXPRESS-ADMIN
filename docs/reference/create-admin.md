# `createAdmin()`

```ts
import { createAdmin } from "prisma-express-admin";

const admin = createAdmin(config);
admin.register(modelName, modelConfig?);
await admin.mount(app);
```

`createAdmin` is the only entry. It returns `{ register, mount }`.

## `AdminConfig`

| Option | Type | Default | Role |
| --- | --- | --- | --- |
| `prisma` | `PrismaLike` | required | Your generated client. The library looks up `prisma[modelKey]`. |
| `auth` | built-in or external auth config | required | Built-in admin credentials/sessions, or an external identity adapter. |
| `schemaPath` | `string` | `prisma/schema.prisma` | Path relative to `process.cwd()`. |
| `basePath` | `string` | `/admin` | Where UI and API are mounted. |
| `siteName` | `string` | `Prisma Admin` | Header label in the UI. |
| `databaseProvider` | `"postgresql" \| "mysql" \| "sqlite" \| "sqlserver" \| "mongodb"` | unset | Enables PostgreSQL case-insensitive search when set to `"postgresql"`. |
| `audit.write` | `(event) => Promise<void>` | unset | Called after successful mutations. |

## `mount(app)`

Must run after every `register`. Must be awaited. Throws if:

- the schema file cannot be read
- DMMF cannot be built (invalid schema or Prisma version mismatch)
- a registered model or field does not exist

Mounts, in order: JSON body parser, built-in auth endpoints when enabled, auth on `/api`, schema route, action routes, CRUD routes, error handler, static UI, SPA fallback.

## Types

```ts
import type {
  AdminConfig,
  AuthConfig,
  AdminUser,
  AuditConfig,
  AdminAuditEvent,
  ModelConfig,
  PrismaLike,
} from "prisma-express-admin";
```
