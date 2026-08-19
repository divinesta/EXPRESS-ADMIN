# Changelog

All notable changes to Prisma Express Admin are documented here.

## Unreleased

## 0.5.3 - 19-08-26

### Security

- Scope resolution now rejects `undefined` values anywhere in the returned Prisma
  `where` fragment, preventing missing tenant context from silently removing the
  tenant filter.
- Same-origin mutation checks now apply to external authentication adapters as
  well as built-in auth, reducing CSRF risk for cookie-backed host sessions.
- `beforeUpdate` hooks now run only after the target row has been found inside
  the admin user's scope, matching delete-hook behavior.

### Changed

- Updated scope and hook documentation to show match-nothing fallbacks for
  missing tenant context and the new `beforeUpdate` execution order.

## 0.5.2 - 19-08-26

### Added

- Added a Django-style delete confirmation page for selected records, including
  a preview of registered cascade relationships that will be deleted with the
  selected parent records.
- Added delete-preview API support for bulk deletes so the UI can show affected
  records before the delete action is confirmed.

### Changed

- Relation list columns no longer show sort controls when the backend cannot
  sort by that relationship field.
- Relation selectors now show the selected record as an inline chip inside the
  search control, with a clear action.
- List pagination now clamps page state to the available page range.

### Security

- Production registrations now require explicit `permissions`; list payloads
  return only configured columns, and common privilege fields are protected by default.
- Nested scope fields and scoped foreign keys cannot be changed through hooks or writes.
- Built-in cookie mutations enforce same-origin requests and admin responses
  prevent framing and caching.

## 0.5.0 - 17-08-26

### Security

- Create, update, delete, and custom actions now deny by default. List and
  view remain available to authenticated administrators unless restricted.
- Added per-field `writeRoles` restrictions, enforced by both the UI and API.
- Built-in authentication now rejects registration of its user and session
  models, preventing credential and session exposure in the admin panel.
- Password verification now applies the stored scrypt parameters with strict
  resource limits and a fixed derived-key length.
- Unknown login identifiers now run a dummy password verification, reducing
  account-enumeration timing differences.
- Added per-process login throttling, enabled by default.
- Login throttling now enforces a per-IP cap as well as per-identifier limits,
  and bounds in-memory tracking to prevent unbounded growth.

### Changed

- Built-in auth cookies, login routes, redirects, API requests, and the UI
  router now honor any configured `basePath`.
- Root-mounted admin paths now resolve to normal same-origin URLs rather than
  protocol-relative URLs.
- A custom action may use either `allowedRoles` or `permissions.actions`; when
  both are configured, both must allow the role.
- The built-in login and logout flow has expanded coverage for rejected roles,
  inactive accounts, cookie settings, logout, throttling, and custom paths.

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
