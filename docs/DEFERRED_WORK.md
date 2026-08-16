# Deferred MVP Work

This file records the work intentionally paused after Phase 3, Block 3
(custom actions). It is a resume checklist, not a promise that every item is
part of the first published release.

## Current position

Completed product blocks:

- Relation foreign-key selection on create and edit.
- Permission-aware, scope-safe custom actions.

Before beginning a new block, run the usual checks:

```bash
bun run typecheck
bun run test:unit
bun run build
npm pack --dry-run
```

## 1. Finish verifying the basic example

**Roadmap item:** Phase 3 — Example app solid.

The example already has its own schema, compose file, seed script, and host.
When a local container runtime is available, complete a clean-start check:

1. Copy `examples/basic/.env.example` to `examples/basic/.env` and set the
   database URL.
2. Start the example database.
3. Generate the example Prisma client, push the schema, and seed it.
4. Start the example host and verify list, create, edit, relation selection,
   and custom actions in `/admin`.

Record the exact commands and any prerequisites in `examples/basic/README.md`.
Do not move the root integration-test fixtures unless the tests are moved with
them.

## 2. Add audit logging

**Roadmap item:** Phase 3 — Audit log.

Goal: retain an append-only record of meaningful admin mutations. At minimum,
each event should contain:

- actor identity (the authenticated admin user);
- event type (`create`, `update`, `delete`, or custom action name);
- model and record identifier(s);
- timestamp;
- optional, deliberately safe metadata such as changed field names.

Keep the design modular:

- an audit-event type and audit-writer interface in core code;
- a small Prisma-backed implementation supplied by the consuming app;
- narrow calls from the create, update, delete, and action paths;
- a dedicated test suite proving events are written and never expose secrets.

Decide before implementation whether audit logging is optional for v1, which
fields must be redacted (passwords, tokens, secrets), and whether action events
are stored as one event per request or one per affected record.

## 3. Add a multi-tenant example

**Roadmap item:** Phase 3 — Multi-tenant `scope` example.

Goal: demonstrate how a consumer prevents an admin from reading or changing a
different tenant's data. The example should have at least two tenants and two
non-super-admin users.

It should show:

- `getCurrentUser()` returning a tenant identifier and role;
- a model `scope` derived from that tenant identifier;
- list, detail, create, update, delete, relation selection, and custom-action
  behaviour under that scope;
- a visible explanation that scope is enforced by the server, not trusted to
  the browser.

Add integration coverage for an attempted cross-tenant record ID, especially
for relation selection and custom actions.

## 4. Final package metadata review before publishing

**Roadmap item:** Phase 1B — Package metadata.

The package identity is now `@divinesta/prisma-express-admin` and the project
uses the MIT license. Before publishing, re-run `npm pack --dry-run` to confirm
the `LICENSE` file is included in the published package.

Also review the package name, description, repository URL, and version just
before the first publish. Do not publish until those values represent the
intended public package.

## Suggested resume order

1. Verify the basic example in a clean local environment.
2. Build audit logging.
3. Add the multi-tenant example and cross-tenant tests.
4. Perform final release checks and publish.
