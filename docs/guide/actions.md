# List actions

List actions are bulk verbs on selected rows. Every list has a built-in **Delete selected** action when the current admin has `delete` permission. It is the default action, honours `scope`, runs the model's delete hooks, and writes a `delete` audit event.

You can add custom actions for other operations, such as publishing posts:

```ts
admin.register("Post", {
  actions: [
    {
      name: "publish_selected",
      label: "Publish selected posts",
      allowedRoles: ["SUPER_ADMIN", "ADMIN"],
      handler: async ({ ids, prisma }) => {
        const result = await prisma.post.updateMany({
          where: { id: { in: ids.map(String) } },
          data: { published: true },
        });
        return { message: `Published ${result.count} posts.` };
      },
    },
  ],
});
```

The UI shows `label`. The route is `POST /admin/api/posts/actions/publish_selected`.

## What the handler receives

```ts
{
  ids: Array<string | number>; // only rows that passed scope
  adminUser: AdminUser;
  prisma: PrismaLike;
}
```

Return `{ message: string }`. That string is what the UI toasts.

## Safety checks, in order

1. Caller is authenticated
2. Caller has **list** permission on the model
3. The action exists and the caller may run it (`allowedRoles`, or `permissions.actions[name]`)
4. Body is `{ ids: [...] }` — 1 to **100** unique string/number ids
5. Those rows are reloaded with `AND: [scope, { id: { in: ids } }]`
6. If any id is missing, the action **does not run** (`400`)
7. Handler, then optional audit `{ type: "action", metadata: { action } }`

Ada cannot publish Grace’s draft by pasting its id into the request.

## Permissions

`allowedRoles` on the action is the usual allowlist. Super-admin bypasses it. Omitting `allowedRoles` means any authenticated admin who can list the model.

You can also set `permissions.actions.publish_selected`. Both are enforced when present.

The schema endpoint only lists actions this person may run. Hidden in the UI is not the boundary — the POST is.

The built-in delete action uses the model's `delete` permission; it cannot be changed through `permissions.actions`.

## Do the work yourself

The library does not interpret the action. If the handler updates rows, **you** should include the same tenant filter you use in `scope`. The pre-check guarantees the ids were in scope at read time; your `updateMany` should not widen that.
