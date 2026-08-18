# Lifecycle hooks

Hooks run on the server inside the request, after validation (and after create-scope is applied), around the Prisma call.

```ts
admin.register("User", {
  beforeCreate: async (data) => {
    if (typeof data.password === "string") {
      data.passwordHash = await hash(data.password);
      delete data.password;
    }
    return data;
  },
  afterCreate: async (record) => {
    await notifyOps(`Created user ${record.id}`);
  },
  beforeUpdate: async (id, data) => data,
  afterUpdate: async (record) => {},
  beforeDelete: async (id) => {
    if (id === SUPER_ADMIN_ID) throw new Error("Cannot delete the root operator.");
  },
  afterDelete: async (id) => {},
});
```

| Hook | When | Can change data |
| --- | --- | --- |
| `beforeCreate` | After validate + create-scope, before `create` | yes, return the object |
| `afterCreate` | After insert | no |
| `beforeUpdate` | After validate + scope-field lock, before `updateMany` | yes |
| `afterUpdate` | After reload | no |
| `beforeDelete` | After the scoped row is found, before `deleteMany` | throw to abort |
| `afterDelete` | After delete | no |

## Useful jobs

- Hash a password (and keep `password` excluded from the schema)
- Add derived values to fields that are already writable
- Refuse to delete Linus
- Fan out to email / queue after a successful write

Thrown errors become `500 INTERNAL_ERROR` unless you throw an `AdminApiError`. Do not put secrets in the message.

## Order on create

1. Auth, permission, validate payload
2. Apply simple `scope` equalities
3. `beforeCreate`
4. Prisma `create`
5. `afterCreate`
6. `audit.write` if configured

Hook output is validated again. Hooks cannot add hidden, read-only, unauthorized, or nested-write fields, and simple scope equalities are re-applied after the hook.
