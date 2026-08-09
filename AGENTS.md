# Repository guidance

- Keep API authorization and task state transitions server-side.
- Never log passwords, tokens, complete cookies, or uploaded file contents.
- Use `Decimal` for monetary values and UUIDs for business identifiers.
- Do not expose PostgreSQL to the host network.
- Production startup runs committed migrations only; it must not run seed automatically.
- Preserve the same-origin `/api/v1` contract used by the Web app.
- Run type checks and relevant tests after changes.
