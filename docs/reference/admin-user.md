# `AdminUser`

Attached to `req.adminUser` after auth middleware accepts the adapter result.

```ts
interface AdminUser {
  id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  tenantId?: string;
  institutionId?: string;
  metadata?: Record<string, unknown>;
}
```

## Required

`id`, `email`, `role`, `isSuperAdmin`. All four must have the right JS type. A missing boolean is a 401, not `false`.

## Optional

| Field | Typical use |
| --- | --- |
| `tenantId` | `scope: () => ({ tenantId: adminUser.tenantId ?? "__no_tenant__" })` |
| `institutionId` | Same idea, older name — both exist |
| `metadata` | Anything else `scope` or hooks need |

The library never reads `metadata` itself. You put it there in `getCurrentUser` and consume it in `scope` / hooks / actions.

## Super-admin

`isSuperAdmin: true` bypasses `permissions` and `allowedRoles`. Write `scope` yourself if that person should see every tenant (`return {}`) or not.
