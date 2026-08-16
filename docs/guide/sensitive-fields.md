# Sensitive fields

The introspector sees every scalar. The admin does **not** show every scalar.

A field is hidden when its name matches:

```
password | token | secret | api_key | api-key | credential | private_key | private-key
```

(case-insensitive). Hidden means:

- omitted from `GET /admin/api/schema`
- omitted from list/detail `select`
- rejected on create/update
- not used as a relation display label

## Opt in

```ts
admin.register("User", {
  fields: {
    apiToken: { expose: true, readOnly: true },
  },
});
```

Without `expose: true`, a name like `apiToken` never appears, even if you put it in `listDisplay`.

Prefer `exclude` when the field should stay gone regardless of its name:

```ts
fields: {
  passwordHash: { exclude: true },
}
```

## Audit

`audit.write` receives actor, model, ids, and safe metadata (for example the action name). It never receives old/new field values. A writer you attach cannot accidentally log the password you just hid.

## Do not rely on obscurity

Hiding `token` is a default, not a classification engine. `ssn`, `cardNumber`, and `otp` do not match the regex. Exclude them explicitly.
