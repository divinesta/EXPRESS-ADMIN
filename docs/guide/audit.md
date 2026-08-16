# Audit log

The library does not own a table. You pass a writer. After a successful create, update, delete, or custom action, it calls `audit.write` with a safe event.

```ts
createAdmin({
  prisma,
  auth: { getCurrentUser },
  audit: {
    write: async (event) => {
      await prisma.adminAuditLog.create({
        data: {
          eventType: event.type,
          modelName: event.modelName,
          recordIds: event.recordIds.map(String),
          actorId: event.actor.id,
          actorEmail: event.actor.email,
          actorRole: event.actor.role,
          metadata: event.metadata,
          createdAt: event.timestamp,
        },
      });
    },
  },
});
```

## Event shape

```ts
{
  type: "create" | "update" | "delete" | "action";
  modelName: string;
  recordIds: Array<string | number>;
  actor: { id: string; email: string; role: string };
  timestamp: Date;
  metadata?: Record<string, string | number | boolean | null>;
}
```

`metadata` is things like `{ action: "publish_selected" }`. It is **never** old/new field values, passwords, or tokens.

## Failure

If `write` throws, the API reports a failure. The mutation may already have happened — do not treat a failed audit as “the Post was not published.” Make the writer reliable (same database transaction if you need that coupling).

## Do not register the log as an admin model

The example defines `AdminAuditLog` and never calls `admin.register("AdminAuditLog")`. Operators cannot edit history from the sidebar. That is a product choice, not a limitation. If you register it, it becomes ordinary CRUD unless you lock it down with permissions and `fields: { *: readOnly }`.

Omit `audit` entirely if you do not want events. Nothing is written by default.
