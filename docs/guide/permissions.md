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

## The three rules people miss

1. **Omitted** — if you leave `delete` off the object, any authenticated admin may delete.
2. **Empty list** — `delete: []` denies everyone except `isSuperAdmin`.
3. **Super-admin** — `isSuperAdmin: true` bypasses these lists. It does not bypass `scope()`.

```ts
// Anyone signed in can do everything on User
admin.register("User");

// Only SUPER_ADMIN can delete; other ops still open to every signed-in admin
admin.register("User", { permissions: { delete: ["SUPER_ADMIN"] } });
```

Be explicit on every operation you care about. Partial objects are not “deny the rest.”

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
