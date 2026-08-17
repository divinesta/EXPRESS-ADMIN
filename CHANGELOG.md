# Changelog

All notable changes to Prisma Express Admin are documented here.

## 0.4.1 - 17-08-26

### Changed

- List-row hover states now use the same surface color as table headers in
  light and dark modes, rather than switching to a high-contrast dark row.

## 0.4.0 - 17-08-26

### Added

- Optional built-in, admin-only authentication using separate
  `ExpressAdminUser` credentials and `ExpressAdminSession` records. It is
  independent from the consuming application's users, login, and sessions.
- A protected `/admin/login` page with accessible email/password or
  username/password sign-in, password visibility control, loading feedback,
  inline errors, and reduced-motion support.
- Database-backed admin sessions using secure, `HttpOnly`, `SameSite=Lax`
  cookies and hashed session tokens.
- The `prisma-express-admin` CLI, including `auth:schema` to generate the
  required Prisma models and `createsuperuser` to create the first active
  `SUPER_ADMIN` account.
- Built-in authentication coverage for password verification, login, session
  creation, and protected API access.

### Changed

- Authentication now supports an explicit `mode: "built-in"` configuration in
  addition to the existing external `getCurrentUser` adapter.
- The basic example now uses built-in admin authentication and provides
  `bun run example:admin:createsuperuser` for its initial administrator.
- Authentication documentation now describes both built-in and external modes.

## 0.3.0 - 16-08-26

### Added

- A built-in **Delete selected** bulk action. It is available to admins with
  `delete` permission, honours model scope, runs delete hooks, and records an
  audit event when audit logging is configured.
- A VitePress documentation site with guides for setup, registration, lists,
  forms, permissions, relations, scope, hooks, auditing, and the HTTP API.
- Row numbering, selectable rows, and responsive table/list controls in the
  admin UI.
- Appearance settings in the admin UI, with system, light, and dark modes plus
  five selectable accent palettes. Preferences are stored locally per device.
- Host-login guidance covering redirects, secure session cookies, admin-role
  checks, MFA, and safe post-login return paths.
- Customer, Category, Product, Order, and OrderItem models in the basic
  multi-tenant example, with deterministic sample data and tenant scopes.

### Changed

- List filters are now opt-in. Configure `listFilter` explicitly; omitting it
  renders no filter controls and rejects filter query parameters for that model.
- Clicking a list row now opens its edit form directly; the separate record
  detail page has been removed.
- Edit controls use native input types where possible, including number,
  date-time, email, URL, password, boolean, enum, and relation fields.
- Refined the admin layout, search and filter controls, sidebar, dashboard,
  tables, forms, typography, and responsive styling.
- Updated the basic example to use explicit list filters and consume the
  package through its published entry point.
- Updated the package homepage and configured the combined landing site and
  documentation site for Vercel deployment.

## 0.2.0 - 16-08-26

### Added

- Optional append-only audit logging through `createAdmin({ audit: { write } })`.
  Events cover successful creates, updates, deletes, and custom actions while
  omitting changed field values and sensitive data.
- A Prisma-backed `AdminAuditLog` writer in the basic example.
- A multi-tenant basic example with Northwind and Contoso, tenant-scoped Users
  and Posts, and switchable development identities.
- Tenant boundaries applied to CRUD, relation selection, and custom actions in
  the example through model `scope()` configuration.
- A package-install smoke test that packs the library, installs the tarball in
  a fresh Bun consumer, generates that consumer's Prisma client, mounts the
  admin, and confirms the packaged UI is served.
- CI verification of the publishable tarball, including installation and mount
  in the fresh consumer project.

## 0.1.0

### Compatibility

- Tested Prisma versions: 7.5.0.
- Supported Prisma range: 7.5.x (`~7.5.0`) for `prisma`, `@prisma/client`,
  and the internal DMMF tooling.

### Added

- Publishable ESM package output, TypeScript declarations, and packaged admin UI.
- A tarball-install smoke test and CI coverage against the supported Prisma minor.
