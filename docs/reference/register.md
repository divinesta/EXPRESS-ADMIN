# `register()`

```ts
admin.register("User");
admin.register("Post", config);
```

Chainable. Call only before `mount()`.

`config` is `ModelConfig`. Every property is optional.

## List

| Key | Type | Default |
| --- | --- | --- |
| `listDisplay` | `string[]` | Display field + scalars (max 6) + `createdAt` |
| `listFilter` | `string[]` | `[]` (opt-in) |
| `searchFields` | `string[]` | Non-id string scalars |
| `defaultSort` | `{ field, direction }` | `createdAt desc` or id desc |
| `perPage` | `number` | `50` |
| `pluralName` | `string` | Lowercase English plural |
| `displayField` | `string` | Auto-detected label field |

## Fields

```ts
fields?: Record<string, { exclude?: boolean; expose?: boolean; readOnly?: boolean }>
```

See [Forms](/guide/forms) and [Sensitive fields](/guide/sensitive-fields).

## Trust

| Key | Type | Default |
| --- | --- | --- |
| `permissions` | `{ list?, view?, create?, update?, delete?, actions? }` | omitted = allow authenticated |
| `scope` | `(adminUser) => Promise<Prisma where>` | `{}` |

Omitted permission keys allow every signed-in admin. `[]` denies everyone except `isSuperAdmin`. Super-admin skips allowlists, not `scope`.

## Extend

| Key | Signature |
| --- | --- |
| `actions` | `{ name, label, handler, allowedRoles? }[]` |
| `beforeCreate` | `(data) => Promise<data>` |
| `afterCreate` | `(record) => Promise<void>` |
| `beforeUpdate` | `(id, data) => Promise<data>` |
| `afterUpdate` | `(record) => Promise<void>` |
| `beforeDelete` | `(id) => Promise<void>` |
| `afterDelete` | `(id) => Promise<void>` |

Action `handler` is `({ ids, adminUser, prisma }) => Promise<{ message: string }>`.

## Not on this object (yet)

`fieldsets`, `inlines`, and `widget` overrides exist in the architecture notes. They are not accepted by the shipped `ModelConfig`.
