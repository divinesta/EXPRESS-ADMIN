# Prisma versions

The first releases support **Prisma 7.5.x only**.

```json
"peerDependencies": {
  "@prisma/client": "~7.5.0",
  "prisma": "~7.5.0"
}
```

`@prisma/internals` (used at mount for DMMF) is pinned to the same minor. A consumer on Prisma 6 or 8 will not get a compatibility shim.

## Policy

- Upgrade `prisma`, `@prisma/client`, and `prisma-express-admin` together
- The changelog lists every tested Prisma version
- CI runs the claimed minor. We do not advertise a version the matrix has not passed

## Schema at runtime

Mount reads `schema.prisma` through `getDMMF()`. That is why the file must exist in production, and why a version skew shows up as a clear DMMF error rather than a silent empty sidebar.

## Database providers

Introspection works for any Prisma provider the schema declares. Search’s `mode: "insensitive"` is only added when you set `databaseProvider: "postgresql"`. Other providers still search; they just use `contains` as Prisma defines it for that engine.

## Client generator

Prisma 7’s `prisma-client` generator emits **TypeScript** (`generated/prisma/client.ts`). Bun and your TypeScript build can import it. Node without a TypeScript loader cannot. That is a Prisma 7 fact, not an admin limitation.
