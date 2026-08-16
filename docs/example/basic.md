# Northwind and Contoso

`examples/basic/` is the dogfood app in this repository. It is not the library. It is the story the Trust guides keep pointing at.

## What is in it

Prisma models: `User`, `Post`, `Tenant`, `AdminAuditLog`.

Only **User** and **Post** are registered. Tenant is a join key. The audit table is write-only from `audit.write`.

Seeded operators:

| Email | Name | Role | Tenant |
| --- | --- | --- | --- |
| `ada@example.test` | Ada Lovelace | `ADMIN` | Northwind |
| `grace@example.test` | Grace Hopper | `ADMIN` | Contoso |
| `linus@example.test` | Linus Torvalds | `SUPER_ADMIN` | Northwind |

Two posts: a published Northwind welcome (Ada) and a Contoso draft (Grace).

## Run it

From the repository root (this is for people cloning the repo, not `npm install` consumers):

```bash
bun install
bun run example:db:up
export DATABASE_URL=postgresql://postgres:postgres@localhost:5435/prisma_express_admin_basic
bun run example:db:generate
bun run example:db:push
bun run example:seed
bun run dev
```

Open `http://localhost:3000/admin`. Switch identity by restarting with `EXAMPLE_ADMIN_EMAIL`:

```bash
EXAMPLE_ADMIN_EMAIL=ada@example.test bun run dev
EXAMPLE_ADMIN_EMAIL=grace@example.test bun run dev
EXAMPLE_ADMIN_EMAIL=linus@example.test bun run dev
```

That env var is **development-only**. Real apps resolve `getCurrentUser` from a session or JWT.

## What the host actually configures

```ts
const admin = createAdmin({
  prisma,
  databaseProvider: "postgresql",
  siteName: "Express Admins",
  auth: {
    getCurrentUser: async () => {
      const user = await prisma.user.findUnique({ where: { email: adminEmail } });
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
  audit: { write: async (event) => { /* AdminAuditLog.create */ } },
});

admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive"],
  searchFields: ["email", "fullName"],
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
});

admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
  searchFields: ["title", "content"],
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" },
  actions: [/* publish_selected, unpublish_selected */],
});
```

## What you should see

As Ada:

- Users: Ada and Linus (Northwind), not Grace
- Posts: the welcome post, not the Contoso draft
- New Post: author dropdown is Northwind people; `tenantId` is filled for you
- Publish selected: only works on Northwind ids

As Grace: the mirror image.

As Linus: both tenants, both posts, both author lists.

If any of that fails, `scope` is not on that path. File an issue — that is a security bug, not a missing feature.

## Source

[examples/basic](https://github.com/divinesta/EXPRESS-ADMIN/tree/main/examples/basic) on GitHub.
