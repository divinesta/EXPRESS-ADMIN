# Authentication

The library does not log anyone in. You already have sessions, JWT, or API keys. You map that identity onto an `AdminUser`.

```ts
createAdmin({
  prisma,
  auth: {
    getCurrentUser: async (req) => {
      const user = await readUserFromYourAuth(req);
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
});
```

Return `null` (or throw) to reject. The API responds `401 AUTHENTICATION_REQUIRED` and does not leak adapter errors.

## Required shape

| Field | Type | Required |
| --- | --- | --- |
| `id` | string | yes |
| `email` | string | yes |
| `role` | string | yes |
| `isSuperAdmin` | boolean | yes |
| `tenantId` | string | no |
| `institutionId` | string | no |
| `metadata` | object | no |

A missing `email` or `isSuperAdmin` is not “almost logged in.” It is 401. The middleware checks the shape before attaching `req.adminUser`.

## Session

```ts
getCurrentUser: async (req) => {
  const session = await sessions.get(req);
  if (!session?.user) return null;
  return toAdminUser(session.user);
};
```

The UI sends `credentials: "include"` so cookies work if admin and API share a site.

## Bearer token

```ts
getCurrentUser: async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const payload = await verifyJwt(header.slice(7));
  return payload ? toAdminUser(payload) : null;
};
```

## What is protected

Every `/admin/api/*` route, including `GET /admin/api/schema`. The schema lists field names, enums, relations, and permissions. Treat it like your data model — because it is.

The static UI (`/admin`, `/admin/users`) is HTML/JS. Screens go blank or show “sign in through the host application” when the schema request is 401. Put the admin behind your own gate as well if the JS bundle must stay private.

## Super-admin vs authenticated

`isSuperAdmin: true` skips **role allowlists**. It does not skip `scope()` unless your `scope` function returns `{}` for that user. Linus in the example is a super-admin *and* the scope function lets him see both tenants. Those are two separate decisions.

The published package has no hardcoded development user. The example’s `EXAMPLE_ADMIN_EMAIL` adapter is example-only.

Full type: [`AdminUser`](/reference/admin-user).
