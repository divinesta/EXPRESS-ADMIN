# Changelog

All notable changes to Prisma Express Admin are documented here.

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
