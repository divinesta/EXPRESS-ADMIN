# Getting started

Install `prisma-express-admin` into **your** Express + Prisma app and open `/admin`.

You already have an Express server and a generated Prisma Client. This package mounts on top of them. It does not create a new project.

## Requirements

- Node.js `^20.19 || ^22.12 || >=24` or Bun `>=1.3`
- Express 4 or 5
- `prisma` and `@prisma/client` **7.5.x**
- Your `schema.prisma` on disk at runtime (default `prisma/schema.prisma`)

Keep `prisma`, `@prisma/client`, and `prisma-express-admin` on the same 7.5 line. See [Prisma versions](/limits/prisma).

## Install

::: code-group

```sh [npm]
$ npm install prisma-express-admin
```

```sh [pnpm]
$ pnpm add prisma-express-admin
```

```sh [yarn]
$ yarn add prisma-express-admin
```

```sh [bun]
$ bun add prisma-express-admin
```

```sh [deno]
$ deno add npm:prisma-express-admin
```

:::

That is the published package name: [`prisma-express-admin`](https://www.npmjs.com/package/prisma-express-admin).

It expects Express and Prisma as **peers**. If this app does not have them yet:

::: code-group

```sh [npm]
$ npm install express @prisma/client
$ npm install -D prisma
```

```sh [pnpm]
$ pnpm add express @prisma/client
$ pnpm add -D prisma
```

```sh [yarn]
$ yarn add express @prisma/client
$ yarn add -D prisma
```

```sh [bun]
$ bun add express @prisma/client
$ bun add -d prisma
```

```sh [deno]
$ deno add npm:express npm:@prisma/client
$ deno add -D npm:prisma
```

:::

Pin Prisma to 7.5.x (`~7.5.0`). Then generate **your** client the way you already do:

::: code-group

```sh [npm]
$ npx prisma generate
```

```sh [pnpm]
$ pnpm exec prisma generate
```

```sh [yarn]
$ yarn prisma generate
```

```sh [bun]
$ bunx prisma generate
```

```sh [deno]
$ deno run -A npm:prisma generate
```

:::

The library never uses a Prisma client from this repository. Pass the client your app generated.

## Add it to your server

In the same file where you create the Express app (or a module it imports):

```ts
import express from "express";
import { createAdmin } from "prisma-express-admin";
import { prisma } from "./prisma.js";

const app = express();

const admin = createAdmin({
  prisma,
  databaseProvider: "postgresql", // set this to your provider
  siteName: "Admin",
  auth: {
    getCurrentUser: async (req) => {
      const user = await getOperatorFromYourAuth(req);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        isSuperAdmin: user.role === "SUPER_ADMIN",
      };
    },
  },
});

admin.register("User");
admin.register("Post");

await admin.mount(app);

app.listen(3000);
```

Replace `"User"` / `"Post"` with model names from **your** `schema.prisma`, PascalCase, exact.

`getCurrentUser` must return `{ id, email, role, isSuperAdmin }` or `null` when you use external auth. A partial object is 401. For built-in admin-only login, sessions, and superuser creation, see [Authentication](/guide/auth).

## Open the admin

Start your server and visit:

```
http://localhost:3000/admin
```

You should see a sidebar with every model you registered. `register("User")` with no second argument is enough for a list and a form. Defaults come from the schema.

## Schema path

At mount the library reads `prisma/schema.prisma` relative to `process.cwd()`. If your schema lives elsewhere:

```ts
createAdmin({
  prisma,
  schemaPath: "db/schema.prisma",
  auth: { getCurrentUser },
});
```

Include that file in the deploy artifact. Mount fails with a clear error if it cannot read or compile the schema.

## What to do next

Zero-config is a start. In a real app you set columns, search, filters, auth, and often `scope` — the same way the example host does.

- [Wire it into your app](/guide/in-your-app) — `listDisplay`, `searchFields`, `listFilter`, `scope`, actions, audit
- [How it works](/guide/how-it-works) — why `mount` is async
- [Authentication](/guide/auth) — session and Bearer adapters
