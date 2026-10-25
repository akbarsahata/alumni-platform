# Cloudflare deployment

Status: agreed 2026-10-24; deployment automation implemented 2026-10-26. Staging is
deployed and verified as of 2026-10-26; production is a later release-gated phase.

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

## Current staging resources

Provisioned on 2026-10-24 in the Cloudflare account that owns `akbarsahata.id`:

| Item            | Value                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| D1 database     | `alumni_staging` (`3cebe648-9065-4be8-ab8f-48958e9d36be`, APAC)                                 |
| KV namespace    | `alumni-staging-local-mail` (`72a57fe4e83c4029a2ada4e5a84ddd80`)                                |
| Migrations      | 25 applied; a repeat list reports no migrations                                                 |
| Worker          | `alumni-platform-staging` deployed 2026-10-26 by Tests run 40238633521                          |
| Custom domain   | `kasmanss.akbarsahata.id` active over TLS; `/login` carries noindex                             |
| Deployment type | Normal production deployment; preview URLs and `workers_dev` disabled                           |
| GitHub          | `staging` environment with the Cloudflare and Worker secrets, plus `D1_DATABASE_ID` for seeding |

The staging environment has `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`BETTER_AUTH_SECRET`, `RESEND_API_KEY` and `D1_DATABASE_ID`. The Worker secrets were
uploaded by the first deploy. The `production` environment now requires reviewer
approval; its secrets, `PRODUCTION_URL`, resources and hostname remain unset.

## Deployment workflow

The [Tests workflow](../.github/workflows/tests.yml) is the automated deployment path.
It now also runs for published GitHub Releases. The stable `tests` job remains the
required check:

- `deploy-staging` starts after `tests` only for a push on `master`, uses the
  `staging` GitHub environment, and runs in the `deploy-staging` concurrency group.
  After acquiring that group it confirms `GITHUB_SHA` is still the current `master`
  head. A superseded run exits without migrations or deployment, so an older push
  cannot overwrite a newer staging revision after waiting behind it.
- `verify-release` starts after `tests` only for a published non-prerelease release
  whose tag matches `v*`. It checks out full `master` history and proves the release
  commit is an ancestor of `master`.
- `deploy-production` needs both `tests` and `verify-release`, uses the `production`
  GitHub environment, and runs in the separate `deploy-production` concurrency group.
  It cannot run for `master` pushes, pull requests, merge queues or prereleases.

Both deploy jobs build and deploy with the same `CLOUDFLARE_ENV` value. The deploy
script (`scripts/deploy.mjs`) performs the same steps locally and in CI:

1. Build the selected environment and validate the flattened
   `build/server/wrangler.json`: Worker name, route, bindings, required secrets,
   variables, observability, disabled previews and disabled `workers_dev`.
2. Delete `build/server/.dev.vars` and reject any other `.dev.vars*` file in the
   build output.
3. Capture a D1 Time Travel bookmark for production.
4. Apply remote D1 migrations before uploading the Worker.
5. Upload the Worker with a temporary `--secrets-file`, then delete the temporary
   directory immediately.
6. Record the deployment ID and Worker version in the job summary.
7. Fetch `https://<origin>/login` and fail unless it returns the application shell.
   Staging must also return `X-Robots-Tag: noindex`.

Manual equivalents:

```sh
npm run deploy:staging -- --check
npm run deploy:production -- --check
npm run deploy:staging
npm run deploy:production
```

`--check` validates the build without credentials, migrations or deployment. A real
production deploy also requires the `PRODUCTION_URL` environment variable and the
production environment's resources and secrets.

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

## Operations

### First staging deploy

1. Confirm the `staging` environment has the five secrets listed above and that the
   owner has approved the first deployment.
2. Merge the deployment workflow to `master`. The push runs the complete `tests` gate
   and then `deploy-staging`.
3. Confirm the job summary records the deployment ID, Worker version, origin, commit
   and smoke check.
4. Verify TLS and `/login` at `https://kasmanss.akbarsahata.id`, and confirm the
   response carries `X-Robots-Tag: noindex`.
5. Send a real login code through Resend, then exercise the transactional email and
   introduction paths with synthetic or appointed accounts.
6. Confirm `wrangler d1 migrations list DB --remote --env staging` reports no
   unapplied migrations, and repeat to prove idempotence.
7. Complete the [remote administrator bootstrap](administrator-bootstrap.md#remote-appointment)
   with the appointed account and verify `/admin/audit`.

### Rollback

A Worker rollback changes code only; it does not undo a D1 migration. Prefer a
forward fix for a bad migration. If a code rollback is required:

```sh
npx wrangler deployments list --env staging
npx wrangler rollback <version-id> --env staging --message "Reason for rollback" -y
```

Use the `alumni-platform-production` Worker name and `--env production` for
production. Record the rollback reason and affected migration/version in the handoff.

### D1 restore

Time Travel is an undo window, not a backup. It is 7 days on Free and 30 days on Paid,
and restore is destructive. Capture a bookmark or export before production migrations
and get explicit approval before restoring.

```sh
npx wrangler d1 time-travel info DB --env staging --json
npx wrangler d1 time-travel restore DB --env staging --bookmark <bookmark>
npx wrangler d1 export DB --remote --env staging --output /private/path/staging.sql
```

Keep exports outside the repository, private and access-controlled. Do not treat a
Time Travel window as a long-term retention policy.

### Remote administrator bootstrap

Live email must work before appointment so the administrator can sign in and obtain a
verified account ID. Follow the [remote appointment procedure](administrator-bootstrap.md#remote-appointment).
The insertion uses a private, reviewed SQL file through
`wrangler d1 execute DB --remote --env <environment> --file <private-file>`. The local
`npm run bootstrap` command remains local-only.

### Seeding

`master` seeds staging and a published `v*` release seeds production. Feature branches
cannot select a seed target. Writes remain disabled by `SEEDING_ENABLED: "false"`
until the production resources and a repeatable seed are proven. See
[seeding](seeding.md).

## Acceptance criteria

- [x] A push or merged pull request on `master` runs the full `tests` gate and then
      deploys staging; a failed test or migration deploys nothing.
- [x] Staging serves at `https://kasmanss.akbarsahata.id` over TLS and all
      non-production responses carry a noindex header.
- [x] Email-code login succeeds with a real Resend message; references, membership
      decisions, invitations, outreach, clarification and email-change emails send
      through the same adapter.
- [x] A successful introduction send records sharing evidence; a provider failure
      leaves the introduction retryable and does not mark it shared.
- [x] All committed migrations are applied to the staging D1 database, and a repeat
      deploy applies none.
- [x] Production resources and secrets are never used by a staging deploy; the
      production job cannot run from `master`, a pull request, a merge queue, or a
      prerelease.
- [x] The deploy workflow uses only GitHub environment secrets, leaves no secret
      values or `build/server/.dev.vars` in artifacts, and has a documented rollback.
- [x] The remote administrator bootstrap procedure is documented and exercised on
      staging with a synthetic or appointed account.
- [x] No R2 binding is added. The deferred private-bucket design is documented.
- [x] Formatting, lint, typecheck, build and the full test suite pass. Any live-send
      test uses a mocked provider and no repository secret.

Verified for staging on 2026-10-26. The login email was the live send; the other notification templates share the same adapter and provider-mock coverage. Production resources, hostname and secrets remain a later phase.

## Remaining production prerequisites

Staging prerequisites are complete as of 2026-10-26. Before production:

1. Choose the production hostname and create separate production D1, KV, Worker and
   environment secrets. Confirm their IDs match `wrangler.jsonc`.
2. Set the production `PRODUCTION_URL`, protect `v*` tags, and confirm the required
   reviewer on the `production` environment.
3. Verify Resend deliverability from the production configuration and repeat the remote
   administrator appointment with production account IDs and a private SQL file.

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
- The smoke check proves only that `/login` serves the application and that staging
  carries `noindex`. It does not prove Email delivery, every notification path or the
  introduction evidence path; those remain separate checks.
- The seed workflow is independent of the deployment workflow. Keep seeding disabled
  until the target database has the committed migrations and the release/deploy path
  is proven.
