# What this is

Prisma Express Admin is an operations panel for apps that already use **Express** and **Prisma**.

You register the models you want to operate on. At mount, the library reads your `schema.prisma`, builds metadata, and serves:

- a React admin UI at `/admin`
- a guarded JSON API at `/admin/api/*`

You do not describe your tables twice. The Prisma schema is the source of truth. `admin.register("User")` with no extra config still produces a list, search, filters, and a create/edit form.

## The whole public API

```ts
const admin = createAdmin({ prisma, auth: { getCurrentUser } })

admin
  .register("User")
  .register("Post", { listDisplay: ["title", "author", "published"] })

await admin.mount(app)
```

Three calls. Everything else is optional configuration on those calls.

## What you bring

| You own | The library owns |
| --- | --- |
| Express app | Admin routes under `basePath` |
| Generated Prisma Client | Introspection of `schema.prisma` |
| Authentication | Mapping your user onto `AdminUser` |
| Tenancy rules, via `scope()` | Applying that scope on every record operation |
| Optional audit destination | Emitting safe, append-only events |

There is **no** built-in login screen, user table, or session store. If `getCurrentUser` returns `null`, the API is 401. Wire it to whatever already authenticates your operators.

## What this is not

- Not a replacement for your public API
- Not a CMS with nested document editing
- Not AdminJS with a Prisma adapter bolted on — DMMF is the contract
- Not a multi-ORM tool (see [Prisma versions](/limits/prisma))

Current writes are **scalar** plus a single `belongsTo` foreign key. Nested creates, many-to-many editors, inlines, and uploads are [not included](/limits/not-included).

## The people in these docs

The [basic example](/example/basic) seeds two companies and three operators. The Trust and Extend guides reuse them so the rules stay concrete.

| Person | Role | Tenant | What they see |
| --- | --- | --- | --- |
| Ada Lovelace | `ADMIN` | Northwind | Northwind users and posts |
| Grace Hopper | `ADMIN` | Contoso | Contoso users and posts |
| Linus Torvalds | `SUPER_ADMIN` | Northwind | Both, because `scope` returns `{}` |

Same role does not mean same rows. That distinction — **permissions vs scope** — is the point of this library.
