# Backend routing, validation, and repositories

Issue [#10](https://github.com/akbarsahata/alumni-platform/issues/10) implements the
requested Hono, Zod, and Drizzle repository refactor. Product behavior from issues
#2–#5 remains the specification; issue #6 is a separate session.

## Request flow

`workers/app.ts` composes the Hono application. Authentication, administration, and
membership routes are declared by method and path, including explicit 405 fallbacks.
Unknown API paths return 404; page requests fall through to React Router. The local
mailbox retains its development-only access checks.

`app/http/middleware.server.ts` enforces trusted mutation origins and no-store
responses, including denied requests. `methods.server.ts` preserves the existing
API HEAD behavior: Hono normally dispatches HEAD through GET, while these APIs
require 405. The policy uses registered route metadata, with no second path list.

Authentication retains a small Hono allowlist in `app/auth/auth.server.ts`, reused
by React Router login/logout actions. Better Auth owns account/session/code
validation and its Drizzle adapter; session tokens remain in HttpOnly cookies.
Only sign-in code requests are exposed, and successful responses project public
identity fields rather than returning library session payloads.

## Shared workflows and schemas

Hono routes in `app/http/` adapt HTTP requests to workflow functions in
`app/membership/` and `app/authorization/`. React Router loaders/actions call those
same functions. The workflows authenticate and authorize before selecting private
records or validating privileged operations.

`app/http/validation.ts` contains the shared Zod schemas. They normalize form
numeric strings and JSON numbers, reject boolean/null numeric input, enforce
graduate versus former-student fields and attendance order, validate roles/house,
require review notes for decisions, and enforce personal knowledge for support.
Unknown fields are stripped; callers cannot supply the authenticated actor.
Validation failures return Bahasa Indonesia 400 responses through the shared parser.
No duplicated JSON/form validation or generic client-visible Zod error payloads.

## Persistence

`app/db/database.server.ts` creates the Drizzle D1 connection.
`app/db/schema.ts` maps existing application read/write columns; auth tables remain
in `app/auth/schema.ts`. Existing SQL migrations own database constraints, defaults,
indexes, and triggers. This refactor requires no migration or data conversion.

Repository factories accept the D1 binding and expose named domain operations:

- `authorization.repository.server.ts`: current roles, membership, primary status.
- `administration.repository.server.ts`: verified accounts, audit history, role changes.
- `membership.repository.server.ts`: applicant projection, queue, decision history,
  conditional revision and decision creation.
- `reference.repository.server.ts`: eligible recipient projection, request/response
  creation, retry eligibility, private history, status, and capture progress.
- `notification.repository.server.ts`: pending messages and delivery recording.

Ordinary projections use typed Drizzle query builders and batched reads. Complex
conditional writes and eligibility projections use parameterized Drizzle `sql`
templates inside repositories. Preserving single-statement writes and SQLite
triggers keeps workflow changes, audit history, and notifications atomic without
adding an unsupported D1 transaction API. Workflows contain no SQL or prepared
queries. Repositories return domain rows, rather than D1 read result envelopes.

Keep private applicant/reference/reviewer projections explicit when adding fields.
Current permissions are loaded per request; conditional writes recheck authority
and workflow state even when a prior read was valid. The private local bootstrap
CLI is an operator tool outside the application repository layer.

## Verification and references

Use the existing Worker/browser/HTTP seam with synthetic accounts, real local D1,
Better Auth, and captured mail. `tests/backend.test.mjs` adds method/unknown-route,
origin/cache, malformed JSON/form, authorization-order, and forged-actor coverage.
Existing membership/reference/role tests cover persistence privacy, history and
concurrent transitions through supported routes. No repository mocks replace them.

```sh
node scripts/test.mjs tests/backend.test.mjs
npm run typecheck
npm run build
npm test
```

Implementation references: [Hono routing](https://hono.dev/docs/api/routing),
[Hono application](https://hono.dev/docs/api/hono),
[Drizzle D1](https://orm.drizzle.team/docs/get-started/d1-existing), and
[Drizzle batch](https://orm.drizzle.team/docs/batch-api). Installed package types and
source were checked for version-specific HEAD dispatch, D1 batches, and result mapping.
