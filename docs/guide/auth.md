# Authentication

Prisma Express Admin has a built-in, admin-only authentication mode. It owns a separate `ExpressAdminUser` table, a separate `ExpressAdminSession` table, and a login page at `/admin/login`.

Your application's own users and authentication are not read or changed.

```text
Application User + application session     ExpressAdminUser + admin session
             /app/login                              /admin/login
```

## Built-in authentication

Choose whether administrators sign in with an email address or a username. Generate the matching Prisma schema:

```sh
npx prisma-express-admin auth:schema --identifier email
```

or:

```sh
npx prisma-express-admin auth:schema --identifier username
```

Paste the generated models into `schema.prisma`, then run your normal Prisma migration and client generation commands.

Configure the admin with the same choice:

```ts
const admin = createAdmin({
  prisma,
  auth: {
    mode: "built-in",
    identifier: "email",
  },
});
```

The user model is `ExpressAdminUser` and the session model is `ExpressAdminSession` by default. You may rename either with `userModel` or `sessionModel` if your Prisma schema uses a different name.

## Create the first superuser

The CLI needs the application's real Prisma client. Create `express-admin.config.mjs` next to your package manifest:

```js
import { prisma } from "./src/prisma.js";

export default {
  prisma,
  auth: {
    mode: "built-in",
    identifier: "email",
  },
};
```

Then run:

```sh
npx prisma-express-admin createsuperuser --config ./express-admin.config.mjs
```

The command asks for the selected identifier and password, hashes the password, then creates an active `SUPER_ADMIN` account. In a CI-only setup, provide `--email` or `--username` plus `EXPRESS_ADMIN_PASSWORD` instead of interactive input.

Open `/admin/login` after starting the server. Built-in auth creates a secure, `HttpOnly`, `SameSite=Lax` cookie with the `/admin` path. It does not create an application session.

## Administrator roles

Only active accounts with `ADMIN` or `SUPER_ADMIN` can sign in. `SUPER_ADMIN` bypasses model role allowlists. `ADMIN` is still subject to configured permissions and `scope()`.

Do not register `ExpressAdminUser` or `ExpressAdminSession` as editable models. They contain credentials and session records.

## External authentication

Teams that already have an identity provider can keep the existing adapter mode:

```ts
auth: {
  mode: "external",
  getCurrentUser: async (req) => {
    const user = await readUserFromYourAuth(req);
    return user ? {
      id: user.id,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.role === "SUPER_ADMIN",
    } : null;
  },
}
```

External mode has no built-in login page because the external system owns the login flow.
