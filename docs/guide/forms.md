# Forms and field visibility

Create and edit forms are generated from field metadata. You do not write a form component per model.

## What is editable

Shown and writable:

- Required and optional scalars (string, number, boolean, datetime, enum, json)
- A `belongsTo` foreign key, as a relation select ([Relations](/guide/relations))

Shown but locked:

- The `@id` field
- `@updatedAt` and `createdAt` with `@default(now())`
- Generated columns
- Anything you mark `readOnly`

Never shown unless you opt in:

- Names that look like secrets ([Sensitive fields](/guide/sensitive-fields))
- Fields with `exclude: true`

Never accepted on write:

- Unknown keys
- Relation objects / nested `create` / `connect`
- Scope-controlled fields (for example `tenantId` when `scope` sets it)

## Overrides

```ts
admin.register("User", {
  fields: {
    passwordHash: { exclude: true },
    email: { readOnly: true },
    accessToken: { expose: true, readOnly: true },
  },
});
```

| Flag | Effect |
| --- | --- |
| `exclude` | Hidden from schema JSON, lists, and forms |
| `expose` | Required to show a sensitive name |
| `readOnly` | Visible, not writable |

There is no `widget: "richtext"` in this release. Types map to a small built-in set: text, number, toggle, datetime, enum select, JSON text, relation select.

## Create vs update

- Create: required scalars must be present (unless they have a default and you omit them). Simple equality `scope` fields are inserted for you.
- Update: uses `updateMany` with scope + id. If nothing matches, the API returns 404, not a row from another tenant.

Hooks that reshape payloads live on [Lifecycle hooks](/guide/hooks).
