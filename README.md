# alumni-platform

[![Tests](https://github.com/akbarsahata/alumni-platform/actions/workflows/tests.yml/badge.svg?branch=master&event=push)](https://github.com/akbarsahata/alumni-platform/actions/workflows/tests.yml?query=branch%3Amaster+event%3Apush)

An alumni platform for one Indonesian high school, operated by its alumni organization. The pilot
focuses on verified membership, finding alumni expertise, supporting school initiatives, bank-transfer
reconciliation, and reporting outcomes. Product screens use Bahasa Indonesia; code and routes use
English.

**Currently implemented:** the local Cloudflare application, email-code login, private administrator
bootstrap, role management, membership applications/manual review, and audit history. References, school invitations, profiles,
initiatives, finance, and engagement workflows remain planned. The latest entries in the
[session handoff](docs/handoff.md) describe implementation and verification; earlier planning statuses
are historical.

## Quick start

Use Node 24 (see [.nvmrc](.nvmrc)) and npm. Supported versions and pinned dependencies are in
[package.json](package.json).

```sh
# Optional, if using nvm:
nvm install
nvm use

npm ci
npm run local:setup
npm run db:migrate
npm run dev
```

Open [localhost:5173/login](http://localhost:5173/login). Request a code with a synthetic address,
then read its captured email in another terminal:

```sh
npm run mail -- synthetic@example.test
```

Setup generates private random keys in `.dev.vars`, preserving an existing file. D1/KV bindings use
local placeholders; no Cloudflare or Resend credentials are needed. Keep `BETTER_AUTH_URL` aligned with
the development origin. See the [environment example](.dev.vars.example) and
[development guide](docs/local-development.md) for configuration and mailbox details.

## Accounts and administration

The main pages are `/`, `/login`, `/logout`, `/membership`, `/admin/membership`, `/admin/roles`, and `/admin/audit`. All accounts use emailed
login codes. Email ownership, alumni membership, and privileged roles are separate; role revocation
applies to existing sessions. Membership or school roles do not automatically grant directory/finance
access.

The primary administrator is appointed privately and alone manages privileged roles and their audit
history. Bootstrap is local-only, runs once, and requires verified account IDs, an operator, a reason,
and a valid house for each trusted alumnus:

```sh
npm run bootstrap -- /private/path/appointment.json
```

Follow the [administrator bootstrap guide](docs/administrator-bootstrap.md) for the input format,
identity checks, role permissions, and audit behavior. There is no public bootstrap endpoint.

Applicants submit school identity and a required house, track status, and correct/resubmit for manual
review. Membership administrators independently check applications, record decisions, and inspect
retained versions/history. See the [membership review guide](docs/membership-review.md).

## Development and verification

```sh
npx playwright install chromium
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
```

Keep port 5173 free before `npm test`. The harness runs real Worker/D1/KV and Chromium journeys with
synthetic accounts and disposable state, preserving normal development data. Tests take about five
minutes because OTP expiry and rate-limit resets use the real clock. See
[verification commands and coverage](docs/local-development.md#verification) for focused runs.

Prettier targets 100 columns with two spaces, double quotes, and semicolons. Use `npm run format` to
format files. VS Code/Cursor [settings](.vscode/settings.json) enable formatting on save with the
[recommended extensions](.vscode/extensions.json). ESLint diagnostics are advisory warnings;
`npm run lint:fix` applies available fixes. The [pre-commit hook](.husky/pre-commit) formats staged
files, lints, and typechecks. The full test suite runs in GitHub Actions. See
[formatting and linting](docs/local-development.md#formatting-and-linting).

The [Tests workflow](.github/workflows/tests.yml) runs on pushes to `master` and protected branches. It
uses Ubuntu, Node 24, and Chromium to check formatting, lint, types, build, and the full test suite
without live credentials. The badge above shows the latest `master` push result. See
[CI details](docs/local-development.md#github-actions).

## Stack and code map

TypeScript, React 19, React Router 8 with server rendering, Cloudflare Workers/D1, Better Auth Email OTP,
and Drizzle's D1 auth adapter. Vite, Wrangler, and Tailwind CSS support development/builds; local email
capture uses KV; membership notifications have a D1 outbox. Private R2 storage, live Resend delivery,
and scheduled outbox processing are planned.

| Location                                                                                        | Responsibility                                                                     |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Worker entry](workers/app.ts) / [routes](app/routes.ts) / [pages](app/routes/)                 | Origin checks, API dispatch, and Indonesian application screens.                   |
| [Authentication](app/auth/)                                                                     | Email-code login, cookie sessions, restricted auth endpoints, and schema mappings. |
| [Authorization](app/authorization/)                                                             | Current permissions, role management, and audit access.                            |
| [Membership](app/membership/)                                                                   | Versioned applications, independent manual decisions, and notification capture.    |
| [Email capture](app/email/email.server.ts)                                                      | Development-only email delivery and restricted mailbox access.                     |
| [Migrations](migrations/)                                                                       | Auth, rate limits, memberships, roles, bootstrap, and atomic audit triggers.       |
| [Scripts](scripts/) / [tests](tests/)                                                           | Operator commands, integration harness, HTTP tests, and browser journeys.          |
| [Worker bindings](wrangler.jsonc) / [Vite](vite.config.ts) / [Playwright](playwright.config.ts) | Runtime, build, and browser-test configuration.                                    |

The separate [compatibility Worker](workers/compatibility-smoke.ts) and
[configuration](wrangler.compat.jsonc) preserve an earlier D1/password-auth probe. Use the main app for
current product workflows.

## Documentation and roadmap

| Document                                                          | Read it for                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Pilot specification](docs/pilot.md)                              | Audience, workflows, operating defaults, evaluation, and exclusions.                      |
| [Architecture and data model](docs/architecture.md)               | Design direction, authorization, storage, email reliability, and recovery.                |
| [Local development](docs/local-development.md)                    | Setup, mailbox, testing, formatting, CI, and deployment boundaries.                       |
| [Administrator bootstrap](docs/administrator-bootstrap.md)        | Private appointments, role isolation, and audit procedure.                                |
| [Membership manual review](docs/membership-review.md)             | Application/status screens, independent checks, decision history, and local verification. |
| [Ticket 1 specification](docs/ticket-1-spec.md)                   | Agreed membership/reference scope and browser/HTTP testing seam.                          |
| [Ticket 1 implementation issues](docs/ticket-1-implementation.md) | Published vertical slices and their dependencies.                                         |
| [Pilot implementation tickets](docs/tickets.md)                   | Broader foundation → membership → directory → initiatives → finance → engagement plan.    |
| [Session handoff](docs/handoff.md)                                | Implementation history, validation, limitations, and next work.                           |
| [Document index](docs/README.md)                                  | Planning-document provenance and historical references.                                   |

The membership parent specification is [issue #1](https://github.com/akbarsahata/alumni-platform/issues/1).
Login, administrator bootstrap/roles, and membership applications/manual review are implemented locally;
the next main slice is [same-house references (#5)](https://github.com/akbarsahata/alumni-platform/issues/5).
References, house corrections, invitations, suspension/reinstatement, and assisted email changes
follow the [issue dependency index](docs/ticket-1-implementation.md). The broader pilot then adds
expertise discovery, approved initiatives, manual bank-transfer reconciliation, and outcome reporting.

## Contribution and deployment

Read [AGENTS.md](AGENTS.md) and the current specifications before implementing tickets. Follow the
[GitHub issue-tracker workflow](docs/agents/issue-tracker.md),
[triage labels](docs/agents/triage-labels.md), and
[domain documentation conventions](docs/agents/domain.md). Reusable agent workflows live in
[.agents/skills/](.agents/skills/).

Development uses synthetic data and captured email. Production builds disable capture and have no
live email adapter. Staging/production setup, domains, resource IDs, retention, recovery, and live
Resend delivery remain follow-up work; the presence of a `deploy` script does not mean deployment is
ready. Keep local secrets, state, build-local secrets, and test artifacts private. See
[deployment boundaries](docs/local-development.md#build-and-deployment-boundary) and
[recovery planning](docs/architecture.md#environments-and-recovery).

The [recovered overview](docs/recovered-readme.md) and
[recovered instructions](docs/recovered-project-instructions.md) preserve initial planning context.
Current specifications, code, and the latest handoff entries supersede historical implementation
statuses.

## Remote database seeding

Changing [seeds/seed.sql](seeds/seed.sql) triggers the seeding workflow: `master` targets
production and other branches target the default environment. Database writes are
currently disabled through the workflow feature flag. See the [seeding guide](docs/seeding.md)
for environment secrets, prerequisites, retries and administrator appointment.
