# Library Packaging & Way Forward

Concrete checklist for turning this repo from a **dogfood project** into a **real installable library**, plus how we handle `@prisma/internals` and what comes next.

**Guiding rule:** Keep a local way to see that things work. Do not let the dogfood host *be* the library.

---

## Why this matters (short)

### 1. Packaging

Today the repo does two jobs:

1. **The library** — `createAdmin()`, register models, mount routes
2. **A demo app** — root host + local Postgres + generated client under `generated/prisma`

That is fine while building. For `npm install`, the library must say:

> Give me *your* Prisma client and *your* schema. I will build admin on top.

It must **not** depend on this repo’s `generated/prisma` or treat the root Express host as the package entry.

### 2. `@prisma/internals`

We use `getDMMF()` at mount to introspect `schema.prisma`. That is the right approach for zero-config admin, but `@prisma/internals` is:

- Not a stable public API
- Version-coupled to Prisma minors
- Heavy (engine / tooling surface)

So we pin a supported range, document it, and run CI against every claimed Prisma minor.

---

## Phase 0 — Decide the shape

**Recommended structure:** monorepo-style in this repo.

```text
EXPRESS-ADMIN/
├── package.json              # the library (publishable)
├── src/                      # library source only
├── ui/                       # admin SPA (built into package)
├── examples/basic/           # dogfood host (was root index.ts)
├── prisma/                   # only for examples + integration tests
├── tests/
└── docs/
```

| Piece | Role |
| --- | --- |
| **Library** | Installable package |
| **Example** | How we dogfood without another codebase |
| **Tests** | Use example schema or fixtures — not “whatever is at repo root forever” |

---

## Phase 1 — Library packaging checklist

Do these in order. Each item is done when the criterion is true.

### A. Public API boundary

| # | Task | Done when |
| --- | --- | --- |
| 1 | Nothing under `src/` imports from `generated/prisma` or the demo host | `grep` for `generated/prisma` in `src/` is empty |
| 2 | `PrismaClient` is typed generically | e.g. a minimal `PrismaLike` / delegate interface — not the demo client type |
| 3 | Single entry: `createAdmin` + types | `package.json` `main` / `exports` point at built `dist`, not the demo host |
| 4 | Demo host leaves the library root | `examples/basic/` (or `dev/`) owns Express listen, `DATABASE_URL`, register User/Post |
| 5 | UI is a build artifact of the library | `ui/dist` is produced by library build and resolved relative to package install path |

**Minimal type idea (conceptual):**

```ts
// Library accepts "anything that looks like a Prisma client"
type PrismaLike = {
  [modelKey: string]: unknown; // or the small delegate interface routerFactory already uses
};

createAdmin({ prisma: PrismaLike, schemaPath?, auth, ... })
```

We lose tight model typing at the boundary (normal for admin libs). Runtime still uses `prisma[meta.prismaClientKey]`.

### B. `package.json` as a real package

| # | Task | Done when |
| --- | --- | --- |
| 6 | Rename/clarify package | e.g. `prisma-express-admin`, version `0.1.0`, description, license, repository |
| 7 | `exports` map | `"."` → types + ESM (and CJS if needed) under `dist/` |
| 8 | `files` field | only `dist/`, maybe `ui/dist`, README, LICENSE — not `examples/`, not raw `src/` unless intentional |
| 9 | Peer dependencies | `express`, `@prisma/client`, `prisma` (same major range we support) |
| 10 | Runtime dependencies | `@prisma/internals` (pinned to that same range); nothing that belongs only to the host |
| 11 | Dev dependencies | test runner, types, example’s `pg` / adapter, UI build tools |
| 12 | Engines | Node/Bun range we actually test |

**Illustrative shape (ranges = whatever Phase 2 commits to):**

```json
{
  "name": "prisma-express-admin",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "ui/dist", "README.md", "LICENSE"],
  "peerDependencies": {
    "express": "^4.18.0 || ^5.0.0",
    "@prisma/client": ">=7.5.0 <8.0.0",
    "prisma": ">=7.5.0 <8.0.0"
  },
  "dependencies": {
    "@prisma/internals": ">=7.5.0 <8.0.0"
  }
}
```

### C. Build & install path

| # | Task | Done when |
| --- | --- | --- |
| 13 | Library build | `bun run build` → `dist/` with JS + `.d.ts` (or separate `tsc` emit) |
| 14 | UI build hooked in | `build` runs `build:ui` then packages UI so `mount()` finds static files after install |
| 15 | Static UI resolution | Resolves to **package** `ui/dist` via `import.meta.url` / package root — works under `node_modules` |
| 16 | `schemaPath` default | Still `prisma/schema.prisma` relative to **consumer `process.cwd()`**, documented |
| 17 | Smoke install | `npm pack` → install tarball in a throwaway folder or example with its own Prisma → `createAdmin` + mount works |

Item 17 is the real “are we a library?” test.

### D. Docs that match packaging

| # | Task | Done when |
| --- | --- | --- |
| 18 | README: install + short consumer example | Their Express + their PrismaClient + `register` + `mount` |
| 19 | Document peers + schema file requirement | Deploy must include `schema.prisma` (or pass `schemaPath`) |
| 20 | Document supported Prisma range | One place: README + package peers |
| 21 | Dev dogfood docs | “Run the example” (`examples/basic`) — root is not the product |

### E. What *not* to publish

- Root demo host as the package entry
- `generated/prisma` as a library dependency
- Hardcoded super-admin as default auth (example only)
- `DATABASE_URL` / Docker as library concerns

---

## Phase 2 — `@prisma/internals` + version matrix

| # | Task | Done when |
| --- | --- | --- |
| 22 | Pick v1 range | e.g. Prisma `7.5.x` only first, or `>=7.5 <8` after matrix is green |
| 23 | Pin policy | Peers + `@prisma/internals` use the **same** range; document “upgrade Prisma → upgrade this package” |
| 24 | CI matrix | Unit + integration tests × each supported Prisma minor |
| 25 | Failure mode | Matrix fails on a minor → fix introspector **or** drop that minor from support — do not claim it |
| 26 | Startup error quality | Bad/missing schema or DMMF failure → clear unsupported Prisma / schema message |
| 27 | Changelog note | Every release lists tested Prisma versions |

**Policy:** Start narrow (the minor we develop against). Widen only when CI is green. Do not promise older majors until proved.

---

## Phase 3 — Product after packaging is honest

Packaging does not replace features; it unblocks “someone else can try this.”

Suggested order after Phase 1–2:

1. **Example app solid** (local dogfood stays easy)
2. **Relation FK on create/edit** (scalar FK + select UI)
3. **Custom actions**
4. **Audit log**
5. **More examples** (multi-tenant `scope`)

Do not block product work forever on packaging — but finish **Phase 1 A–C** before inviting external users or npm publish.

---

## Immediate next steps

1. Create `examples/basic/` — move current root host (`index.ts`, compose usage, demo register calls) there.
2. Decouple `src/` from `generated/prisma` — generic `PrismaLike` / delegate interface.
3. Set peers + deps + `exports` + `files`.
4. Fix UI static path for installed package.
5. `npm pack` + install into example (or a throwaway app) — prove mount works.
6. Rewrite README as consumer docs + “developing this repo.”
7. Add CI matrix for the Prisma minors we claim (start with current 7.5).

---

## Success criteria (Phase 1 done)

Someone can do this in a **fresh** project:

```bash
npm i express prisma-express-admin
npm i -D prisma @prisma/client
# their schema, their generate
```

```ts
const admin = createAdmin({ prisma, auth: { getCurrentUser } });
admin.register("User");
await admin.mount(app);
```

…and open `/admin` with **their** models — no clone of this repo required.

The example app is only how *we* develop and demo; it is not the library.

---

## Progress tracker

Use this section to tick items as you go.

### Phase 0

- [x] Repo layout agreed (library vs `examples/` vs tests)

**Decision:** The repository root is the publishable library: `src/` contains
library code, `ui/` contains the SPA source and its packaged build artifact,
and `tests/` contains library tests. The runnable dogfood application moves to
`examples/basic/`, where it owns the Express host, local development identity,
and demo model registrations. The root `prisma/` schema and `compose.yml`
remain development and integration-test fixtures until the example migration
places their ownership more explicitly; they are never part of the published
library surface.

### Phase 1A — Public API

- [x] 1. No `generated/prisma` imports in `src/`
- [x] 2. Generic Prisma client typing
- [x] 3. Package entry is `dist`, not demo host
- [x] 4. Demo host in `examples/basic/` (or equivalent)
- [x] 5. UI artifact path works for install

### Phase 1B — package.json

- [x] 6. Package metadata
- [x] 7. `exports`
- [x] 8. `files`
- [x] 9. Peer dependencies
- [x] 10. Runtime dependencies (incl. `@prisma/internals`)
- [x] 11. Dev dependencies cleaned up
- [x] 12. Engines

### Phase 1C — Build & install

- [x] 13. Library build → `dist/`
- [x] 14. UI build in library build
- [x] 15. Static UI resolution under `node_modules`
- [x] 16. `schemaPath` documented for consumers
- [x] 17. Smoke install (`npm pack`) green

### Phase 1D — Docs

- [x] 18. Consumer README example
- [x] 19. Peers + schema requirement
- [x] 20. Supported Prisma range documented
- [x] 21. Dev / example docs

### Phase 1E

- [x] Confirmed demo client, super-admin default, and DB glue are not published as library surface

### Phase 2 — Prisma / internals

- [x] 22. Supported range chosen (Prisma 7.5.x)
- [x] 23. Pin policy written
- [x] 24. CI matrix running (Prisma 7.5.0 green)
- [x] 25. Support list matches green matrix only
- [x] 26. Clear DMMF / schema startup errors
- [x] 27. Changelog lists tested Prisma versions

### Phase 3 — Product

- [x] Example app solid
- [x] Relation FK create/edit
- [x] Custom actions
- [x] Audit log
- [x] Multi-tenant example

---

## Related docs

- Architecture vision: [`prisma_admin_architecture.md`](./prisma_admin_architecture.md)
- Current scalar CRUD API: [`docs/api.md`](./docs/api.md)
- Future multi-ORM research: [`docs/MULTI_ORM_NOTES.md`](./docs/MULTI_ORM_NOTES.md)
- Local run notes: [`README.md`](./README.md)
