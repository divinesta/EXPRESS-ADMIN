# Errors

Expected failures share one shape:

```json
{
  "error": "Record not found",
  "code": "RECORD_NOT_FOUND"
}
```

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Bad query, body, ids, or write keys |
| `401` | `AUTHENTICATION_REQUIRED` | Adapter returned null or a malformed user |
| `403` | `PERMISSION_DENIED` | Role not on the allowlist |
| `404` | `MODEL_NOT_FOUND` | Plural name is not registered |
| `404` | `RECORD_NOT_FOUND` | Missing, or outside `scope` (same code on purpose) |
| `500` | `INTERNAL_ERROR` | Unexpected. Message is generic |

Out-of-scope reads look like missing rows. That is intentional — the API does not confirm that another tenant’s id exists.

Adapter exceptions are converted to 401. Hook exceptions that are not `AdminApiError` become 500 without the internal message.
