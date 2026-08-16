# Register a model

```ts
admin.register("User")
admin.register("Post", { listDisplay: ["title", "author", "published"] })
```

The first argument is the Prisma model name, **PascalCase, exact**. The second argument is optional. Every key on it is optional.

`register` is synchronous. It stores intent. Validation and default-filling happen in `mount`.

## Zero config

`admin.register("User")` still works. At mount the library picks:

| Concern | Default |
| --- | --- |
| Display label | First unique string among `name`, `title`, `label`, `username`, `slug`, `email`; else any unique string; else first string; else the id |
| List columns | Display field first, then other non-id scalars, up to 6, then `createdAt` if present |
| Search | Non-id string scalars (not FK scalars) |
| Filters | Enums, booleans, date-times, and FK scalars |
| Sort | `createdAt` descending, or the id |
| Page size | 50 |
| Permissions | Any authenticated admin |
| URL slug | Simple English plural (`User` → `users`, `Category` → `categories`) |

Reach for the second argument when those defaults are wrong — not before.

## What you can customize

```ts
admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
  listFilter: ["published", "createdAt"],
  searchFields: ["title", "content"],
  defaultSort: { field: "createdAt", direction: "desc" },
  perPage: 25,
  displayField: "title",
  pluralName: "posts",
  fields: {
    content: { readOnly: true },
  },
  permissions: {
    delete: ["SUPER_ADMIN"],
  },
  scope: async (adminUser) =>
    adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId },
});
```

Full table: [`register()` reference](/reference/register).

## Validation at mount

These throw with the available names so a typo does not become a silent empty column:

- Model does not exist in `schema.prisma`
- `listDisplay` / `fields` / `displayField` names that are not on the model
- `searchFields` that are not strings
- `register()` after `mount()`
- `mount()` twice

Composite primary keys (`@@id([a, b])`) and models with no `@id` are skipped with a warning. They cannot be registered in this release.

## Only registered models appear

A model in the schema is invisible to the admin until you `register` it. The [basic example](/example/basic) has `Tenant` and `AdminAuditLog` in Prisma and never registers them — so they never show in the sidebar.
