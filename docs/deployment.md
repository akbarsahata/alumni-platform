# Cloudflare deployment

Status: agreed 2026-10-24. Staging is the current delivery; production is a later
release-gated phase.

## Decisions

| Item                | Decision                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Staging trigger     | Push or merged pull request on `master`                                                      |
| Staging URL         | `https://kasmanss.akbarsahata.id`                                                            |
| Production trigger  | A published, non-prerelease GitHub Release whose tag is protected and matches `v*`           |
| Production URL      | To be chosen before the production phase                                                     |
| Email provider      | Resend, using the existing verified domain                                                   |
| Sender and reply-to | `iam@akbarsahata.id`                                                                         |
| DNS                 | The domain is an active Cloudflare zone                                                      |
| Environments        | Separate D1 database, KV namespace, secrets and email credentials for staging and production |
| File storage        | R2 is deferred; no feature requires it yet                                                   |

A GitHub Release is safer than a raw tag push because publishing a release is an
explicit, recorded action. Protect `v*` tags with a GitHub ruleset so ordinary
writers cannot move or delete them, restrict the `production` environment to those
tags, and require reviewers on that environment. Reject prereleases and verify the
release commit is on `master` before deploying.

Staging is a normal production deployment of the `alumni-platform-staging` Worker,
not a preview version. Preview URLs and `workers_dev` are disabled. Real production
uses a separate `alumni-platform-production` Worker with its own D1 database, KV
namespace, secrets and hostname.

## Goals

- Deploy the React Router Worker to Cloudflare staging whenever `master` changes,
  after the complete `tests` gate passes.
- Send real transactional email through Resend for login codes, references,
  membership decisions, invitations, outreach, clarification and introductions.
- Apply D1 migrations to the remote staging database before each staging deploy.
- Keep production resources, secrets and data completely separate.
- Make the production release path deliberate and review-gated, ready to enable
  after staging is proven.
- Document provisioning, first deploy, smoke checks, rollback, retention and
  administrator bootstrap.

## Non-goals

- Provisioning production resources or choosing the production hostname now.
- R2 buckets or payment-evidence upload/download.
- Scheduled outbox retries, provider webhooks, bounce/complaint processing or
  digest delivery. Synchronous delivery and the existing manual retry paths remain
  the staging behavior; add scheduled retries before relying on production email
  for the pilot.
- Cloudflare Access, an email allowlist or Turnstile. Staging should not be shared
  publicly until one of these protections is chosen.
- Preview deployments for pull requests.
- Automated database deletion, retention jobs or disaster-recovery drills.

## Work

### 1. Live email

- Replace the built-Worker fail-closed behavior in `app/email/email.server.ts` with
  a Resend adapter using `POST https://api.resend.com/emails`.
- Keep local KV capture for development and the real Worker/D1/Better Auth
  integration seam.
- Add `RESEND_API_KEY` as a Worker secret and `EMAIL_FROM`, `EMAIL_REPLY_TO` and the
  environment name as non-secret configuration.
- Send `from` and `reply_to` values from configuration, never hard-code the sender.
- Pass an `Idempotency-Key` for retryable notification, invitation, outreach,
  introduction and email-change messages. Resend keeps keys for 24 hours.
- Apply a bounded request timeout and fail with a sanitized error. Never log OTPs,
  message bodies, recipient addresses or the API key.
- Decouple introduction sharing from the local mailbox. After Resend accepts the
  message, conditionally mark `outreach_introduction` shared with the same
  eligibility, consent, role and recipient checks used by `captureIntroduction`.
  Keep the local D1 mailbox path for development.
- Add focused tests with a mocked provider: success, provider error, timeout,
  idempotency header, missing configuration, and the production introduction path.
  Local capture and existing tests must keep working without live credentials.
- Confirm the Resend domain, SPF, DKIM and DMARC records, and send test messages to
  at least two major mailbox providers before calling staging ready.

### 2. Wrangler environments and resources

- Create a staging D1 database and KV namespace. Record their IDs in
  `wrangler.jsonc` under `env.staging`.
- Add a production environment section with separate resource IDs, even if it is not
  provisioned until the production phase.
- Repeat every non-inheritable key in each environment: `d1_databases`,
  `kv_namespaces`, `routes`, `vars`, `secrets`, `workers_dev` and observability.
  Wrangler does not inherit these from the top level. The Cloudflare Vite plugin
  flattens the selected environment into `build/server/wrangler.json` at build time.
- Set `BETTER_AUTH_URL=https://kasmanss.akbarsahata.id` for staging and the eventual
  production origin for production. Set `EMAIL_FROM` and `EMAIL_REPLY_TO` to
  `iam@akbarsahata.id` initially.
- Add `secrets.required` so deploy fails when `BETTER_AUTH_SECRET` or
  `RESEND_API_KEY` is missing.
- Use `custom_domain: true` routes. Disable `workers_dev` for deployed
  environments so only the configured origin is valid for origin checks and
  cookies.
- Add a non-production `X-Robots-Tag: noindex` response header. Do not index
  staging.
- Replace the unqualified `deploy` script with explicit staging and production
  commands, or make it fail without an environment.

### 3. Remote D1 migrations

- Apply migrations before the Worker deploy:
  `wrangler d1 migrations apply DB --remote --env staging`.
- Run the migration step inside the per-environment concurrency group so two
  deployments cannot migrate the same database concurrently.
- Treat migrations as forward-only and expand/contract. A Worker rollback does not
  undo a migration, and several existing migrations drop or recreate triggers and
  views.
- Capture a D1 Time Travel bookmark or export before production migrations. Time
  Travel is 7 days on Free and 30 days on Paid, and restore is destructive.
- Document how to restore a staging database and how to roll back a Worker.
- Update the seed workflow and `scripts/seed.mjs`: `master` must target staging,
  releases must target production, and other branches must not silently share a
  production-like target.
- Add a remote administrator-bootstrap procedure. Live email must work first so the
  appointed administrator can sign in and obtain a verified account ID; then insert
  `organization_bootstrap` through a private, reviewed `wrangler d1 execute
--remote` file. The existing `scripts/bootstrap.mjs` remains local-only.

### 4. CI/CD

Extend the existing [Tests workflow](../.github/workflows/tests.yml) so the stable
`tests` gate stays the required check:

- `deploy-staging` runs after `tests`, only for a `push` on `master`, with the
  `staging` GitHub environment.
- `deploy-production` runs after `tests`, only for a published non-prerelease
  GitHub Release, with the `production` environment and required reviewers.
- Build and deploy with the same `CLOUDFLARE_ENV` value.
- Use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the matching GitHub
  environment.
- Provide `BETTER_AUTH_SECRET` and `RESEND_API_KEY` as environment secrets. Pass
  them to the Worker with a temporary `--secrets-file` or set them once through
  `wrangler secret put`; pick one documented approach. Delete temporary secret
  files immediately.
- Delete `build/server/.dev.vars` before deploy. The Vite plugin copies local
  `.dev.vars` into the build output.
- Smoke-check the deployed origin after deploy and fail the job when the origin does
  not serve the app.
- Keep staging and production concurrency groups separate. Never cancel an
  in-progress production migration.
- Record the Worker version or deployment ID in the job summary and document
  `wrangler rollback`.

### 5. Documentation and operations

- Add this runbook to the README and documentation index.
- Update `docs/local-development.md`, `docs/seeding.md`, `docs/architecture.md` and
  the handoff with the actual environment, commands, evidence and remaining risks.
- Document that staging email can reach real addresses and must not be public
  without Access or an allowlist.
- Document that D1 Time Travel may retain deleted rows for its retention window and
  that R2 evidence storage remains deferred.

## Acceptance criteria

- [ ] A push or merged pull request on `master` runs the full `tests` gate and then
      deploys staging; a failed test or migration deploys nothing.
- [ ] Staging serves at `https://kasmanss.akbarsahata.id` over TLS and all
      non-production responses carry a noindex header.
- [ ] Email-code login succeeds with a real Resend message; references, membership
      decisions, invitations, outreach, clarification and email-change emails send
      through the same adapter.
- [ ] A successful introduction send records sharing evidence; a provider failure
      leaves the introduction retryable and does not mark it shared.
- [ ] All committed migrations are applied to the staging D1 database, and a repeat
      deploy applies none.
- [ ] Production resources and secrets are never used by a staging deploy; the
      production job cannot run from `master`, a pull request, a merge queue, or a
      prerelease.
- [ ] The deploy workflow uses only GitHub environment secrets, leaves no secret
      values or `build/server/.dev.vars` in artifacts, and has a documented rollback.
- [ ] The remote administrator bootstrap procedure is documented and exercised on
      staging with a synthetic or appointed account.
- [ ] No R2 binding is added. The deferred private-bucket design is documented.
- [ ] Formatting, lint, typecheck, build and the full test suite pass. Any live-send
      test uses a mocked provider and no repository secret.

## Human prerequisites

The implementation can be prepared without credentials, but the first deployment
requires the owner to:

1. Create the staging D1 database and KV namespace in the Cloudflare account that
   owns `akbarsahata.id`, or provide the IDs for review.
2. Confirm `kasmanss.akbarsahata.id` is available in that zone and that the deploy
   token can create Workers routes and DNS records.
3. Create a Resend API key scoped to the verified domain and sending only.
4. Configure the `staging` GitHub environment with `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `BETTER_AUTH_SECRET` and `RESEND_API_KEY`.
5. Approve the first staging deploy and complete the administrator appointment.
6. Before production: choose the production hostname, create separate production
   resources and environment secrets, protect `v*` tags, and configure required
   reviewers on the `production` environment.

## Risks

- Live email is the critical path. Without Resend, login and every notification
  fail closed.
- Synchronous sends have no scheduled retry. Existing flows return pending states,
  but a provider outage can delay membership and outreach notifications.
- Resend suppression handles hard bounces and complaints outside the application.
  The app does not yet process provider webhooks.
- D1 migrations run ahead of the Worker. Review each new migration for backward
  compatibility before production.
- Time Travel is an undo window, not a long-term backup. A production export policy
  and restore drill remain follow-ups.
