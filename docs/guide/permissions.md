# Permissions

Permissions answer: **may this role perform this operation on this model?**

They do not answer: **which rows?** That is [`scope`](/guide/scope).

Ada and Grace are both `ADMIN`. They have the same permissions. They do not see the same posts.

## Per-model allowlists

```ts
admin.register("Post", {
  permissions: {
    list: ["SUPER_ADMIN", "ADMIN"],
    view: ["SUPER_ADMIN", "ADMIN"],
    create: ["SUPER_ADMIN", "ADMIN"],
    update: ["SUPER_ADMIN", "ADMIN"],
    delete: ["SUPER_ADMIN"],
    actions: {
      publish_selected: ["SUPER_ADMIN", "ADMIN"],
    },
  },
});
```

Operations: `list`, `view`, `create`, `update`, `delete`, plus named actions.

## The four rules people miss

1. **Omitted reads** — `list` and `view` are available to an authenticated admin unless you restrict them.
2. **Omitted writes** — `create`, `update`, `delete`, and custom actions are denied unless you explicitly allow a role.
3. **Empty list** — `delete: []` denies everyone except `isSuperAdmin`.
4. **Super-admin** — `isSuperAdmin: true` bypasses these lists. It does not bypass `scope()`.

```ts
// Anyone signed in can read User, but nobody except a super-admin can write it.
admin.register("User");

// Allow ADMIN to create and update, but reserve deletion for SUPER_ADMIN.
admin.register("User", { permissions: { create: ["ADMIN"], update: ["ADMIN"], delete: ["SUPER_ADMIN"] } });
```

Be explicit about every write operation you want enabled. Partial objects deny omitted writes.

## Protecting individual fields

Use `writeRoles` to protect sensitive application fields even when a role may update the model:

```ts
admin.register("User", {
  permissions: { update: ["SUPER_ADMIN", "ADMIN"] },
  fields: {
    role: { writeRoles: ["SUPER_ADMIN"] },
    isActive: { writeRoles: ["SUPER_ADMIN"] },
  },
});
```

The field remains visible in lists but is excluded from edit forms for other roles. The API enforces this too.

## How the UI uses this

`GET /admin/api/schema` returns booleans for the current person:

```json
{
  "permissions": {
    "list": true,
    "view": true,
    "create": true,
    "update": true,
    "delete": false,
    "actions": { "publish_selected": true }
  }
}
```

The sidebar hides models without `list`. The built-in **Delete selected** list action is hidden without `delete`. The API still enforces the same check — hiding a control is not the security boundary.

## Custom actions

An action needs **list** permission and the action allowlist (`allowedRoles` on the action and/or `permissions.actions[name]`). Missing records in the selection abort the whole action. See [Custom actions](/guide/actions).
