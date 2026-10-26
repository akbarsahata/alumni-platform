# Navigation progress and action hierarchy — 2026-10-26

Added the global loading indicator and aligned form action colors on `master`. No
migration, environment, deployment or email behavior changed.

## Loading indicator

- `app/components/navigation-progress.tsx` watches React Router `useNavigation` and
  calls BProgress `start()` for `loading`/`submitting` states and `stop()` when idle.
  It is mounted at the root, so link navigations, redirects and `Form` submissions on
  every route use it.
- Added `@bprogress/react@1.2.7` (with transitive `@bprogress/core@1.3.4`) and wrapped
  the app in `ProgressProvider`. The bar is 6px, teal-to-gold (`#17665e` → `#dcae48`)
  with a teal/gold glow, starts at a 15% minimum width and has no spinner.
- It covers client-side navigations and form submissions, not the initial document
  load.
- The first implementation delayed the start by 120ms to avoid flashes on fast
  loaders. Local navigations completed before that, so the bar never appeared; the
  delay was removed.

## Submit and cancel actions

- Primary form submissions remain the default filled teal `Button` (or the shared
  plain-button style). Explicit `type="submit"` was added where missing.
- Added a neutral `cancel` variant to `app/components/ui/button.tsx` and matching
  `data-variant="cancel"` styles for plain buttons. Decline/close actions use it:
  **Tolak permintaan** and **Tutup kebutuhan**.
- Added `data-variant="destructive"` red-outline treatment for irreversible actions:
  profile/clarification deletion and completion, consent withdrawal, membership
  suspension and role revocation. Removed the old `border rounded px-4 py-2`
  overrides from primary submit buttons.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build` and `npm run test:unit` pass
  (16 helper tests).
- Chromium smoke against the local dev server: the progress bar appeared at 6px with
  `rgb(23, 102, 94)` during a deliberately delayed client navigation, completed and
  was removed; `/`, `/login` and the 404 route hydrated without console errors.
- Hosted run `40242056584` initially failed the first outreach browser journey
  (`clarification.spec.ts`) on its 30-second hydration wait while all other contexts
  passed and a retry reproduced it. `@bprogress/react` and `@bprogress/core` are now
  pre-optimized in `vite.config.ts`, matching the existing cold-start guard for lazy
  browser routes.
- Focused `node scripts/test.mjs --context outreach` passes all HTTP suites and all
  eight Chromium journeys after clearing `node_modules/.vite`.
- Full `npm test` was not run in this checkout. Hosted CI is the full-suite gate for
  this push.

---

# Staging verified and issue #34 closed — 2026-10-26

Post-merge [Tests run 40238633521](https://github.com/akbarsahata/alumni-platform/actions/runs/40238633521)
passed the stable gate and deployed `alumni-platform-staging` (deployment
`43f8db3d-b08e-4438-8037-c7d61f75118a`, version
`3815fa21-5068-4f76-9cc3-0731140cb472`). Remote D1 has 25 applied migrations and none
pending. `https://kasmanss.akbarsahata.id/login` returns TLS HTTP/2 200 with
`X-Robots-Tag: noindex`.

Live Resend login succeeded for the appointed primary. DMARC was missing and was added at
`_dmarc.akbarsahata.id` (`p=none`, reports to `iam@akbarsahata.id`) and verified against
the authoritative nameservers and public DoH; SPF and Resend DKIM were already present.
The remote administrator bootstrap was applied once at `2026-10-25T22:20:47.731Z`. The
`organization_bootstrap` row and one `bootstrap-primary` audit event are present, and the
owner confirmed `/admin/audit`. Issue
[#34](https://github.com/akbarsahata/alumni-platform/issues/34) is closed.

The reproducible appointment and role-grant procedure now lives in the
[role-bootstrap skill](../.agents/skills/role-bootstrap/SKILL.md), linked from
[administrator bootstrap](administrator-bootstrap.md). The skill commit `0ba9a20` used
`[skip ci]`, so no workflow ran for the documentation change.

Remaining boundary: the login email was the live send; the other notification templates
share the same Resend adapter and provider-mock coverage but were not each live-triggered.
Production resources, hostname and secrets remain unprovisioned.

---

# PR 3 deployment automation — 2026-10-26

Implemented on branch `feat/cloudflare-deploy-ci` in worktree
`/Users/akbar/.local/share/opencode/worktree/7d1130/cloudflare-deploy-ci`. Delivery PR:
[#40](https://github.com/akbarsahata/alumni-platform/pull/40). PR #40 merged on
2026-10-25. The work below was prepared without a remote migration, deployment, live email
send or administrator appointment; those operations were completed after merge and are
recorded in the verification section at the top. Issue
[#34](https://github.com/akbarsahata/alumni-platform/issues/34) is closed.

## Workflow and runner changes

- The Tests workflow now also runs for published releases. `deploy-staging` requires
  the stable `tests` gate, runs only for a `master` push, uses the `staging`
  environment and the `deploy-staging` concurrency group.
- `verify-release` requires a published non-prerelease `v*` release and proves
  `GITHUB_SHA` is an ancestor of `master` using full history. `deploy-production`
  needs both `tests` and `verify-release`, uses the reviewer-gated `production`
  environment and the separate `deploy-production` concurrency group. Neither deploy
  job can run from a pull request, merge queue, feature branch or prerelease.
- Both deploy jobs set `CLOUDFLARE_ENV` and pass only environment secrets. The deploy
  script uses a temporary `--secrets-file`, deletes it in `finally`, rejects an
  environment mismatch, records the deployment ID/Worker version in the job summary,
  and smoke-checks `/login`. Staging must also return `X-Robots-Tag: noindex`.
- `scripts/smoke.mjs` bounds each attempt and retries deployment propagation. It
  checks status, HTML content type, the application shell and the noindex header; it
  does not log bodies or secrets.
- `seed.yml` now triggers only on `master` pushes or published non-prerelease `v*`
  releases. `scripts/seed.mjs` targets staging for `master` and production for a
  release, rejects mismatched event/target combinations, and keeps
  `SEEDING_ENABLED: "false"`.

## PR #40 review follow-up

The P2 review finding noted that the staging concurrency group does not preserve push
order: an older push with slower tests can start after a newer push and overwrite it.
`deploy-staging` now acquires the staging concurrency group, queries the current
`master` head with the workflow token, and skips all remote mutations when
`GITHUB_SHA` is no longer that head. A newer push that arrives after the check still
deploys afterward through the same group, so the final successful deployment follows
the newest tested `master` commit. In-progress migrations remain uncancelled.

## Documentation

Updated `docs/deployment.md`, `docs/local-development.md`, `docs/seeding.md`,
`docs/architecture.md`, `docs/administrator-bootstrap.md`, `docs/ci-testing.md`,
`docs/README.md`, `README.md` and this handoff. The administrator guide now separates
the local command from the reviewed remote `wrangler d1 execute --file` procedure and
requires live email/verified account IDs first.

## Verification

- `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run build`
  pass.
- `npm run deploy:staging -- --check` and `npm run deploy:production -- --check` pass
  sequentially. The deploy check removed a deliberately copied
  `build/server/.dev.vars`. Parallel deploy checks race on the shared `build/`
  directory and must be run sequentially.
- `npm run deploy:production -- --check` with `CLOUDFLARE_ENV=staging` fails before
  building, proving the environment mismatch guard.
- Seed checks pass for `master`→staging and published release→production, and reject
  release→staging, master→production, prerelease, non-`v*` and feature-branch cases.
- The smoke runner passed against a local HTML/noindex probe and rejected a response
  without noindex.
- Both workflow files parse as YAML and pass `actionlint`; `node --check` passes for
  the changed scripts.
- `npm run test:unit` passes all 16 helper tests.

The full `npm test` suite was not run in this worktree because port `5173` is occupied
by the main-repository development server. Hosted PR
[#40](https://github.com/akbarsahata/alumni-platform/pull/40) checks pass: static
checks/build, all four integration contexts and the stable `tests` gate. The deploy
jobs skipped as expected on a pull request. No live Resend request, Cloudflare API
call, remote migration or deployment was made.

## Remaining human checks

- The `staging` GitHub environment already exposes the expected five secret names
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BETTER_AUTH_SECRET`,
  `RESEND_API_KEY`, `D1_DATABASE_ID`); values were not inspected.
- The `production` environment now requires reviewer approval. It has no secrets,
  `PRODUCTION_URL` variable, resources or hostname yet. Production remains deliberately
  undeliverable.
- After merge, verify the first `deploy-staging` run, TLS and `/login`, noindex, real
  Resend login and transactional sends, the introduction evidence path, 25 applied
  migrations plus a repeat no-op, and the remote administrator bootstrap. Close #34
  only after that evidence exists.

## Remaining risks

- The seed workflow is independent of the deployment workflow. Keep seeding disabled
  until the target database has the committed migrations and the deployment path is
  proven.
- The smoke check proves only that `/login` serves the application and that staging
  carries noindex; it does not prove email, all notifications or introduction
  evidence.

---

# PR #37 review fixes — 2026-10-25

Addressed the three review findings on PR
[#37](https://github.com/akbarsahata/alumni-platform/pull/37).

## Delivery serialization

- Migration `0025_introduction_delivery_attempts.sql` adds
  `outreach_introduction_delivery`. It persists the stable idempotency key, attempt
  count, recipient snapshot, first-attempt time, provider message ID and
  `dispatching`, `accepted`, `failed` or `ambiguous` state.
- A provider claim creates the attempt atomically through a D1 trigger. Withdrawal and
  eligibility/staff-recipient invalidation now skip active provider attempts, so a
  concurrent withdrawal cannot win after the irreversible send begins. Invalidation
  resumes after a definite provider rejection.
- Provider acceptance is recorded before `shared_at`. If the evidence write fails,
  the accepted attempt remains and a coordinator retry reconciles evidence without
  calling Resend again.
- Timeout/transport outcomes are ambiguous. They remain blocked from withdrawal and
  retry with the same Resend key for 24 hours. After the key window, retry is blocked
  for operator reconciliation instead of blindly sending a duplicate.
- Local development keeps the atomic D1 mailbox path. Tests now run the real provider
  attempt/repository/D1 path against a loopback mock Resend server, including a held
  send/withdrawal race, staff replacement during send, definite failure, ambiguous
  outcome, 24-hour blocking and evidence reconciliation without resend.

## Verification

- `npm run test:unit` passes 16 helper tests, including sanitized adapter errors,
  ambiguous timeout classification and introduction attempt orchestration.
- Focused introductions pass 16 HTTP journeys and 3 Chromium journeys.
- Full `npm test` passes all helper suites, every HTTP suite and all 23 Chromium
  journeys.
- `npm run typecheck`, `npm run build`, `npm run lint` and `npm run format:check` pass.
- Migration `0025` applied successfully to ordinary local D1 with `npm run db:migrate`.
- No live Resend request was made. Provider integration tests use only the loopback
  mock server; no repository mocks replace the real D1 seam.

## Remaining boundaries

Deployment/provisioning and human live-send checks remain PR 2/3 work. Ambiguous
provider outcomes after 24 hours require an operator to inspect the provider and
resolve the attempt; there is no scheduled reconciliation UI or webhook processing
yet. The mock provider URL override is test-only; deployed environments default to
the Resend endpoint.

---

# Resend email delivery adapter — 2026-10-24

PR 1 of the Cloudflare deployment work is implemented on branch
`feat/resend-email-adapter` in worktree
`/Users/akbar/projects/alumni-platform-resend-email`. This change adds the live email
adapter and introduction-sharing evidence path only. No staging/production environment
resources, deployment workflow, remote migration, administrator appointment or live
email send was added.

## Behavior

- `app/email/resend.server.ts` posts to `https://api.resend.com/emails` with configured
  `from` and `reply_to` values, a bounded 10-second timeout, sanitized errors and no
  logging of recipients, bodies, OTPs or credentials.
- `app/email/email.server.ts` selects local KV capture only for
  `ENVIRONMENT=development` in a development build. Staging/production select Resend;
  missing or unknown configuration fails closed. The local mailbox endpoint now also
  requires `ENVIRONMENT=development`.
- Retryable sends pass stable `Idempotency-Key` values for membership notifications,
  reference requests, invitations, email changes, outreach requests/reminders and
  introductions. Resend retains these keys for 24 hours.
- Consented introductions keep the atomic local D1 mailbox for development. In
  staging/production, provider acceptance is followed by a conditional
  `markIntroductionShared` update with the same eligibility, consent, staff-role,
  recipient-email and coordinator checks as local capture. A rejected or failed
  sharing write leaves the introduction retryable and does not mark it shared.
- Top-level Wrangler configuration now declares `ENVIRONMENT`, `EMAIL_FROM`,
  `EMAIL_REPLY_TO`, and required `BETTER_AUTH_SECRET`, `LOCAL_MAIL_KEY` and
  `RESEND_API_KEY` names. Staging/production sections and deploy commands remain the
  next delivery slice.

## Verification

- `npm run test:unit` passes 17 helper tests: five mocked-provider adapter checks, six
  introduction orchestration checks, and six existing location-list checks.
- Focused introduction verification passes all 12 HTTP journeys and all three Chromium
  journeys:
  `node scripts/test.mjs tests/introductions.test.mjs tests/browser/introductions.spec.ts`.
- Full `npm test` passed the helper suites, every HTTP suite and all 23 Chromium
  journeys with no failures or skips. A repeat run after the final provider-only SQL
  simplification was blocked by an unrelated dev server on `127.0.0.1:5173` from another
  worktree; that server was left running.
- Hosted PR [#37](https://github.com/akbarsahata/alumni-platform/pull/37) checks pass:
  static checks/build, all four integration contexts, and the stable `tests` gate.
- The `markIntroductionShared` statement was separately syntax- and behavior-checked
  against a disposable SQLite schema, including the `captured`/`shared_at` constraint.
- `npm run typecheck`, `npm run build`, `npm run lint` and `npm run format:check` pass.
  The local build copies `.dev.vars` into ignored `build/server/.dev.vars`; that copy is
  not committed and must be deleted before any deploy.
- No live Resend request was made. The adapter tests use an injected fake `fetch`; local
  integration tests still use captured mail.

## Remaining boundaries

No staging/production Wrangler environments, resource IDs, deploy script, CI deploy
jobs, remote migrations, seed retargeting, remote bootstrap or operational runbook are
included yet. Resend domain/SPF/DKIM/DMARC verification and real sends to two mailbox
providers remain human deployment checks. Provider acceptance followed by a D1 sharing
write failure is not atomic; the idempotency key prevents duplicate retries within the
provider window, but scheduled retries and webhooks remain future work.

---

# Cloudflare deployment planning — 2026-10-24

Created the agreed [Cloudflare deployment specification](deployment.md) for staging at
`https://kasmanss.akbarsahata.id` and release-gated production. Published flat
implementation issue [#34](https://github.com/akbarsahata/alumni-platform/issues/34)
with `enhancement` and `ready-for-human`; the first deploy needs owner Cloudflare and
GitHub environment access. A non-prerelease GitHub Release on a protected `v*` tag is
the safest production trigger, with a reviewer-gated `production` environment. No
application code, remote resource, secret, deployment, or live email change was made.
The GitHub plugin was unavailable in this session; tracker operations used the
authenticated `gh` CLI. The specification and documentation index entry are included
in this documentation commit.

# System-wide local timestamp display — 2026-10-24

Issue [#31](https://github.com/akbarsahata/alumni-platform/issues/31) is implemented
on branch `feat/local-timestamp-display-31` in worktree
`/Users/akbar/projects/alumni-platform-issue-31`. Delivery PR:
[#35](https://github.com/akbarsahata/alumni-platform/pull/35). No migration,
deployment, remote database change or live email is included.

## Behavior

- Every workflow instant inventoried in
  [local-timestamp-display](local-timestamp-display.md) now renders through
  `app/components/local-timestamp.tsx`: admin and outreach audits, membership and
  directory histories, profile confirmation, outreach expiry/consent/sharing/closure
  and outcome summaries, and reference/invitation/email-change expiry notices.
- `LocalTimestamp` keeps the exact UTC instant in both `dateTime` and `title`, while
  the readable text shows browser-local time, a short timezone label (`WIB` in the
  browser tests) and a Bahasa Indonesia relative description. Invalid values still
  fall back to their original text; the server/first client render keeps the stable
  UTC fallback.
- Explanatory copy that claimed all displayed times were UTC now points to the
  browser timezone. Date-only school-need and outreach calendar values remain
  date-only and are not passed through `LocalTimestamp`.
- Stored timestamps, expiry comparisons, chronology and authorization are unchanged;
  this is display-only. Server-side email bodies remain explicitly UTC because they
  have no browser timezone.

## Verification

- Browser journeys run with the Indonesian locale and the non-UTC `Asia/Jakarta`
  timezone and assert local text, the `WIB` label, Indonesian relative text, and UTC
  `dateTime`/`title` values on the migrated surfaces.
- `npm test -- --context auth`, `membership`, `directory` and `outreach` each pass,
  including the focused timestamp assertions in the membership, directory, outreach,
  roles, references, invitations, email-change, profile and clarification journeys.
- Full `npm test` passes six helper tests, 108 HTTP tests and all 22 Chromium
  journeys with no failures or skips.
- `npm run typecheck`, `npm run build`, `npm run lint` and `npm run format:check`
  pass.
- An unrelated development server occupying `127.0.0.1:5173` from another worktree
  was stopped so the isolated test runner could bind the port; it was not restarted.
  No ordinary local D1 data or environment file was changed.

---

# Profile deletion and manual retention — 2026-10-24

Issue [#20](https://github.com/akbarsahata/alumni-platform/issues/20) is implemented
on branch `feat/profile-deletion-retention`, following
[the local specification](profile-deletion-retention-spec.md) and the
[manual retention runbook](deletion-retention.md). No deployment, remote migration,
live email or scheduled purge was added. Hosted verification runs on PR
[#36](https://github.com/akbarsahata/alumni-platform/pull/36).

## Behavior

- Members use **Privasi & penghapusan** from `/profile` or `/profile/deletion`.
  The request is confirmed in Bahasa Indonesia, hides the profile immediately,
  records a UTC due date 30 calendar days later, and keeps the account,
  membership, roles and financial records unchanged. Repeated/concurrent
  submissions return the one active request without moving the due date.
- The existing eligibility triggers cancel pending outreach requests, queued
  request/reminder notifications, and pending/claimed introductions. Interested
  or declined responses, shared introductions and outcomes remain historical.
  Active requests can no longer consent to a new introduction or add
  clarification.
- Profile save and confirmation are rejected while a request is active, including
  after the profile row has been removed. A completed lifecycle leaves the profile
  row absent; the member may create a new profile and start a later lifecycle.
  Once a new profile exists, `/profile/deletion` shows the request form again while
  retaining the completed request as visible history.
- The primary-only `/admin/profile-deletions` queue orders active requests by due
  date and recent completions by completion time, marks overdue work, and shows
  safe membership identity only. Its detail page has separate **Hapus konten
  profil** and **Hapus teks klarifikasi privat** actions plus completion evidence.
  Completion is blocked until both steps are done; repeated or racing actions
  create no duplicate event. The screen grants no directory search, profile
  browsing, outreach workspace, or clarification-text access.
- Profile removal deletes exactly the profile row and records `0`/`1` rows.
  Clarification removal deletes messages on requests where the member is the
  recipient and records the count; messages the member wrote as a coordinator in
  another member's thread remain. Completion stores a trimmed 1–1,000 character
  evidence note.
- `/admin/audit` was not widened. Deletion evidence is the append-only request
  event history, with only actor IDs, action, count, UTC time, and completion
  evidence. No general audit or deletion projection contains email, profile text,
  clarification text, need details or outcome notes. Deletion workflow instants
  use the shared browser-local `LocalTimestamp` component; the UTC instant remains
  in its `dateTime` and `title` attributes.

## Persistence and operator boundary

- Migration `0024_profile_deletion_retention.sql` adds the request/event tables,
  one-active-request index, manual `retention_execution` evidence table,
  aggregate-only `school_need_retention_snapshot`, candidate/hold views, derived
  projection guards and delete guards. The migration applied successfully to the
  ordinary local D1 in this checkout with `npm run db:migrate`; existing local
  data was preserved.
- `retention_clarification_candidate` uses the earliest request end (declined or
  cancelled response, expiry, or need closure). `retention_closed_need_candidate`
  exposes closed needs past 12 months with aggregate counts.
  `retention_profile_deletion_hold` exposes active deletion requests and the
  12-month completed evidence holds.
- Ordinary cleanup requires a matching `retention_execution` row, the applicable
  retention period, and an aggregate snapshot before individual outreach records
  are removed. Delete guards defer outcome/introduction/request removal during an
  active or unexpired profile-deletion hold. The profile-deletion processing path
  is the only non-retention exception, for the member's own clarification thread.
- School-need reports read the latest retained aggregate snapshot once it exists,
  so counts remain visible after the individual outreach rows are purged. The
  snapshot contains no member identity, contact, content or individual timestamp.
- The runbook covers export/backup, candidate review, aggregate snapshot,
  execution evidence, deletion order, profile-deletion evidence removal, and
  verification queries. No trigger may be disabled to bypass a guard.

## Verification

- Review follow-up: deletion request/detail/queue reads now use schema-typed
  Drizzle projections instead of hand-typed raw SQL; `/profile/deletion` offers a
  new request once a profile exists after completion; and the retention journey
  verifies an authorized school-need report still shows the preserved aggregate
  after outreach rows are purged.
- Focused:
  `node scripts/test.mjs tests/deletion.test.mjs tests/browser/deletion.spec.ts`
  passes all five HTTP journeys and the Chromium deletion journey.
- Outreach context:
  `node scripts/test.mjs --context outreach` passes outreach, introductions,
  outcomes, clarification and deletion HTTP suites plus all eight Chromium
  journeys in that context.
- Full `npm test` passes every HTTP/helper suite and all 23 Chromium journeys,
  including the real OTP expiry/rate-limit windows and the new deletion journey.
  A longer fixture set exposed recipient pagination in the existing outreach
  browser journey; it now follows **Penerima berikutnya** by URL instead of
  assuming the first candidate page.
- `npm run typecheck`, `npm run build`, `npm run lint` and `npm run format:check`
  pass.
- The retention review uses disposable persisted records and the documented
  operator SQL: it exercises 90-day clarification candidates, 12-month closed-need
  aggregates, snapshot creation, execution evidence, premature-deletion rejection,
  active evidence holds, the complete deletion order after aging, deletion-evidence
  removal after its hold, and confirmation that aggregate snapshots remain.
- Chromium evidence: `test-results/deletion-member-mobile.png` and
  `test-results/deletion-admin-desktop.png` were visually inspected; the mobile
  request/status layout has no horizontal overflow.
- Because another local session occupied port 5173 during part of this work, the
  final local suite runs used an isolated 5174 Worker. CI still uses the committed
  5173 configuration. No test infrastructure or default port was changed.

## Remaining boundaries

No deployment, remote migration, live email, scheduler, automatic purge, account
deletion, membership deletion, role revocation, financial deletion, bulk retention
UI, or backup automation is included. Already-shared email remains in the
recipient mailbox and restricted sharing evidence; the product only stops future
sharing. Issue #20 remains open on GitHub until the delivery PR is reviewed and
merged.

---

# Cold-cache CI hydration correction — 2026-10-24

Continuation of PR [#33](https://github.com/akbarsahata/alumni-platform/pull/33).
The font-isolation change alone did not make hosted runs green. Run #64 still
failed directory hydration on `/school-needs` and a clarification browser journey,
while HTTP suites, auth, membership and static checks passed.

Clearing only generated `node_modules/.vite` reproduced the failure locally:
Vite returned `504 Outdated Optimize Dep`, followed by failure to dynamically
import React Router's client entry. Adding `zod` to pre-optimization resolved the
representative journey, then exposed the same invalidation on a detail page when
`date-fns` and `date-fns/locale` were first discovered. All three now belong to
`optimizeDeps.include` so lazy browser routes do not invalidate active modules.
Browser page exceptions are reported without publishing trace/session artifacts;
clarification cleanup now preserves the original failure instead of masking it.
The earlier external-font probes demonstrated a separate dependency risk, not a
complete explanation of the hosted failures.

Validation passes both cold-cache directory and outreach context runs: every
HTTP suite, five directory Chromium journeys and seven outreach Chromium journeys.
Formatting/lint/typecheck run in the commit hook; the production build is checked
separately after stopping the test Worker. Hosted success and merge are still pending
at this source snapshot. The user authorized continued fixes/pushes until all PR
checks pass, then merging to `master`. No deployment is authorized or performed.
See [CI testing](ci-testing.md) for cold-cache reproduction and dependency rules.

# Parallel CI integration contexts — 2026-10-23

Implementation is pushed on `codex/parallel-ci-tests` in managed worktree
`/Users/akbar/.codex/worktrees/parallel-ci-tests/alumni-platform`, rebased onto
`origin/master` at `b01fbfa` after source PR #32 merged. Open delivery PR:
[#33](https://github.com/akbarsahata/alumni-platform/pull/33), targeting `master`.
Implementation commit: `bdea30a`; diagnostic screenshot fix: `107f454`.
No deployment, remote migration, live email or repository-rule change occurred.

## Current design and documentation

[CI testing](ci-testing.md) is the operational reference for the stage graph,
exact context ownership, fixture/bootstrap dependencies, commands, required gate,
test assignment and diagnostics. [Architecture](architecture.md#verification-architecture)
and [backend architecture](backend-architecture.md#verification-and-references)
describe the verification boundary; [local development](local-development.md#verification)
contains setup and focused commands. Older handoff sections below are historical;
current OTP checks age disposable verification/limiter rows instead of sleeping.

The Tests workflow runs static checks/build/helpers, then four parallel context
jobs (`auth`, `membership`, `directory`, `outreach`), then the stable `tests` gate.
Each context owns its Worker/D1/KV, runs HTTP producers before Chromium consumers,
and keeps one browser worker. Directory/outreach repeat roles bootstrap for
`accounts.json`; helpers also repeat. File assignment fails closed for missing,
stale or duplicate entries. The final gate rejects unsuccessful/skipped prerequisites;
`fail-fast: false` preserves sibling results. Plain/full and file-focused commands
remain supported. Parallelism requires separate runners, not competing local
Workers on port 5173. Run typecheck/build apart from a running test Worker to
avoid shared generated-route-type races.

## Verification and hosted boundary

All four context commands passed locally: 108 distinct HTTP tests, six helper
tests and 22 Chromium journeys, with repeated helper/bootstrap execution excluded
from distinct counts. Typecheck, production build, lint, formatting and diff checks
passed. Command totals excluding Worker readiness were approximately 9s auth,
35s membership, 35s directory and 67s outreach; these local numbers are not hosted
speedup evidence. Sequential baseline [run #59](https://github.com/akbarsahata/alumni-platform/actions/runs/39877810992)
completed in 5m 21s, including about 4m 14s of HTTP/browser execution.

The [first parallel run](https://github.com/akbarsahata/alumni-platform/actions/runs/39878646139)
passed directory HTTP checks but hit its representative-name browser timeout.
A deliberately stalled font reproduced the 30-second timeout and masked cleanup
error: optional screenshots waited for fonts. Removing those two captures passed
the identical probe in 2.3s. Temporary instrumentation was removed. All identity,
consent, captured-mail and mobile-width assertions remain; final local directory
validation passes every HTTP check and five Chromium journeys. Hosted logs alone
do not prove that font loading caused the original failure.

Follow-up after `daa79e1`: [run #62](https://github.com/akbarsahata/alumni-platform/actions/runs/39879576352)
failed both directory and outreach browser journeys after their HTTP suites passed.
The screenshot-only change was insufficient. A stalled Google Fonts stylesheet
reproduced the representative timeout in `page.goto`; after preserving cleanup
errors, the original wait was visible. The shared account helper now aborts remote
Google Fonts requests once per browser context. The same unavailable-host probe
passes in 2.0s, and remains as regression coverage in the representative journey.
Directory/outreach cleanup uses settled promises to preserve the primary error.
Local full directory/outreach context validation passes every HTTP suite,
five directory Chromium journeys and seven outreach Chromium journeys. Hosted validation of this correction is still required; no longer timeout
or automatic retry was introduced. PR #33 is not yet confirmed hosted-green.

# School-need form refinements — 2026-10-23

The `/school-needs` create and edit forms now collect structured time and location
data while keeping compact, parseable backend payloads. Submission and action
feedback now uses toasts plus per-field client errors. Workflow timestamps on the
school-need detail page now render in the browser's timezone with a Bahasa Indonesia
relative description. The follow-up notification gap requested after this refinement
was filed as [#30](https://github.com/akbarsahata/alumni-platform/issues/30) after
checking the pilot and outreach specifications for conflicts and duplicates. The
system-wide timestamp rollout is tracked in
[#31](https://github.com/akbarsahata/alumni-platform/issues/31). Ordinary local D1 was
migrated; no deployment or live email occurred.

## Behavior

- **Perkiraan komitmen waktu** is three controls: a positive whole-number amount,
  unit (`jam` or `hari`), and an optional frequency (`per hari`, `per minggu`, or
  `per bulan`). The backend payload is
  `<amount>|<unit>[|<frequency>]`, for example `2|jam|per-minggu`. A missing
  frequency omits the third segment. Detail and outreach views render the payload as
  readable Indonesian, for example `2 jam per minggu`.
- **Waktu pelaksanaan** uses native date inputs for a required start and optional
  end. The backend payload is `YYYY-MM-DD` or `YYYY-MM-DD|YYYY-MM-DD`. The end date
  is also persisted as the need deadline used by existing outreach expiry, so no
  separate **Batas waktu** input remains. The API response still exposes the derived
  `deadline`; API input no longer accepts a standalone `deadline` field.
- **Tautan inisiatif (opsional)** normalizes scheme-less values on blur, paste and
  Enter (for example `school.example/initiative` becomes
  `https://school.example/initiative`), validates HTTP(S) URLs, and shows an inline
  error. The shared validation also normalizes/validates API JSON callers.
- **Lokasi kegiatan** adds **Di lokasi di luar sekolah**. Both on-site modes require
  an address; remote remains optional. Choosing **Di lokasi sekolah** prefills
  `SMAN Sumsel, Palembang`, which remains editable. Choosing the external mode clears
  that school prefill and requires a manually entered location.
- The create page and need-detail page now show Sonner success/error toasts for
  submission, edit, validation and approval actions. The existing inline alerts
  remain for no-JS and accessible feedback.
- Workflow timestamps on the need-detail page (closure, revision creation and
  approval) use `app/components/local-timestamp.tsx`. It formats with `date-fns` and
  the Indonesian (`id`) locale in the browser's local timezone, adds the short
  timezone label, and appends a relative description such as `(2 jam yang lalu)`.
  The server/first client render uses a stable UTC fallback; the relative text
  refreshes every minute. Date-only Waktu pelaksanaan values are unchanged.
- Both forms run the same client validation on submit. Invalid controls receive
  inline messages, `aria-invalid`, and a red border; the first invalid control is
  focused, and errors clear as the corresponding field changes. Validation covers
  required text and lengths, positive whole-number time commitments, date order,
  required locations, paid-detail requirements, and HTTP(S) initiative links. The
  server schema remains authoritative.

## Persistence and verification

- Migration `0023_school_need_location_scope.sql` additively stores
  `location_scope` (`school` or `outside`) on `school_need` and
  `school_need_revision` and recreates the two history triggers. Stored
  `location_mode` remains `remote`/`on-site`; `off-site` is projected as
  `on-site` + `outside`. Existing rows default to `school`. The migration was applied
  to ordinary local D1 with `npm run db:migrate`.
- Focused `node scripts/test.mjs tests/school-needs.test.mjs tests/browser/school-needs.spec.ts`
  passes all five HTTP journeys and the Chromium journey. The browser journey covers
  the initial invalid submission with per-field errors and an error toast, error
  clearing, the school-location prefill, clearing it for an external location, manual
  external address entry, the formatted time commitment/date range, link
  normalization, inline invalid-link feedback, the success toast, and the resulting
  detail page. It runs with `id-ID` locale and `Asia/Jakarta` timezone and asserts the
  `WIB` timezone label plus Indonesian relative time.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and the final full
  `npm test` pass. The full suite passes every HTTP suite and all 22 Chromium
  journeys, including the real authentication expiry and rate-limit windows.
- The ordinary localhost server remains available (`/login` 200, signed-out
  `/school-needs` 401) after the migration.
- PR #32 review fix: school-need required, length, enum and conditional rules now
  live in `app/school-needs/schema.ts`. The API `schoolNeedInput` and the browser form
  validator both consume the same schemas/predicates; the browser maps Zod issues to
  the individual controls with Indonesian messages. This removes the duplicated
  rule set and aligns the client with the server's `staffContactUserId` bound.
- Issue [#30](https://github.com/akbarsahata/alumni-platform/issues/30) records the
  requested change-notification enhancement with `enhancement` and `needs-triage`.
  The candidate scope is in
  [school-need-change-notifications.md](school-need-change-notifications.md). It
  notes the pilot/outreach conflict: sent terms are immutable and material changes
  require a replacement need with fresh responses and consent, so in-place mutation
  should not be implemented without a specification change. The recommended
  spec-compliant scope is notification on closure/replacement.
- Issue [#31](https://github.com/akbarsahata/alumni-platform/issues/31) tracks the
  system-wide timestamp rollout with `enhancement` and `ready-for-agent`. The shared
  rules, date-only exception, inventory and acceptance criteria are in
  [local-timestamp-display.md](local-timestamp-display.md).

---

# Private outreach clarification — 2026-10-21

Issue [#18](https://github.com/akbarsahata/alumni-platform/issues/18) is implemented
on branch `feat/private-outreach-clarification`, following
[the local specification](clarify-outreach-privately-spec.md). The user's delivery
instruction supersedes the specification's local-only boundary: this branch is
pushed and proposed in a PR. No deployment or live email occurred.

## Behavior

- Each outreach request now has one private clarification thread on the
  authenticated request page. The request recipient and any current directory
  coordinator can read and post plain-text messages of 1–2,000 characters. Messages
  are ordered by UTC timestamp and rendered with whitespace preserved.
- Message projections expose only role label, body, timestamp, and whether the
  viewer authored the message. Author account IDs and emails are not returned to
  either party. The account menu continues to show the signed-in viewer's own email;
  that is existing navigation behavior, not a clarification projection.
- Clarification is independent of response and consent. The write path updates only
  the clarification table. It never changes request status, response, decline
  reason, deadline, need version or fields, consent, or introduction evidence.
- A thread is writable only while the request is `pending` or `interested`, the
  deadline has not passed, its need is still open, and the recipient remains
  eligible. Declined, cancelled, closed, expired, or no-longer-eligible requests
  remain readable but read-only, including an interested request whose need was
  closed or whose recipient lost eligibility after the response. Role revocation
  blocks the next read and write because access is rechecked through the existing
  request-scoped predicate.
- A member message notifies the current assigned coordinator if they still hold the
  role. A coordinator message notifies the recipient. Self-notification is skipped.
  Notification mail contains no message text, need details, names, school name, or
  account email; it links to the authenticated request. Capture is best effort with
  no clarification outbox or retry, as agreed.
- Staff and students receive no clarification text or identities. The coordinator
  need workspace links to the request page but does not render the thread. Primary
  administrators receive only a minimal `clarification-message` audit event with
  actor, need, and UTC time; primary status alone grants no thread access.
- Migration `0022_outreach_clarifications.sql` adds the immutable message table,
  request chronology index, and minimal audit trigger. There is no automated purge;
  timestamps and rows remain for the later manual retention/deletion workflow.
  No environment variables or remote resources were added.

## Verification

- Focused HTTP and Chromium journey:
  `node scripts/test.mjs tests/clarification.test.mjs tests/browser/clarification.spec.ts`
  passes 6 HTTP journeys and the clarification Chromium journey. The journey covers
  mobile member posting, coordinator discovery through the need page and reply,
  thread visibility, staff/student absence, form reset, and no horizontal overflow.
- Audit, takeover, revocation, self-notification, validation, origin, no-store, and
  read-only behavior are covered in the HTTP suite. Notification targeting and
  privacy are asserted through captured mail.
- The eligibility-loss regression covers an interested request whose recipient opts
  out: member and coordinator posts return 409, `canClarify` is false for both, and
  the earlier message plus interested status remain readable.
- A deterministic local notification-capture failure could not be produced through
  supported request behavior without replacing the mail adapter. The write commits
  before capture and the catch preserves the message, but this slice has no
  failure-injection test for that branch.
- Chromium evidence: `test-results/clarification-mobile.png` and
  `test-results/clarification-desktop.png` were visually inspected. The mobile
  layout has no horizontal overflow; the skip link is not left focused in the
  evidence.
- After rebasing onto the #19 outcome merge, the full HTTP suite passes, including
  both outcome and clarification journeys and the existing five-minute
  authentication-expiry checks. The merged Chromium set has 22 journeys; the final
  full run passed 20 and hit two unrelated timing flakes (`corrections` and
  `outreach`). Both flaky specs passed in isolated reruns on the rebased branch.
  Because the ordinary localhost dev server occupied port 5173 and existing browser
  specs hardcode that origin, verification used a disposable Worker on port 5174
  with a temporary, uncommitted copy of those specs adjusted to the isolated origin.
- `npm run typecheck`, `npm run build`, `npm run lint`, and
  `npm run format:check` pass.
- Ordinary localhost remains available. Automated verification used disposable D1
  state and synthetic accounts. No deployment or live email occurred.

The next local implementation frontier is **#20** (directory deletion and manual
retention). This branch was rebased onto `master` after the #19 outcome merge
([PR #27](https://github.com/akbarsahata/alumni-platform/pull/27)); its migration is
renumbered to `0022_outreach_clarifications.sql`.

---

# Outcome review fixes — 2026-10-20

Remediation of the Standards and Spec review of `700c93a`, on
`codex/issue-19-technical-spec`.

- Outcome mutations now check request access and the selected operation's role or
  member authority before validating privileged outcome fields. Malformed requests
  from unrelated accounts retain 404; malformed actions forbidden to coordinators,
  ordinary recipients or suspended recipients retain 403. Authorized invalid input
  still returns 400. Conditional-write authority checks remain in place.
- The coordinator need route revalidates its loader on 409, refreshing the current
  outcome and expected revision. Directory search excludes React Router's `_routes`
  transport parameter before strict business-filter validation; otherwise the
  selective conflict reload returned 400 instead of restoring the form.
- HTTP regression additions first failed against the original validation order.
  The browser regression first failed because the old outcome remained visible;
  after the reload override it exposed the transport-parameter rejection. The final
  focused run passes all seven outcome HTTP journeys and the Chromium journey,
  including refreshed state/revision and a successful reviewed retry.
- Post-fix Standards and Spec reviews both report zero findings. No migration,
  bindings, secrets, deployment or live email are required. All verification uses
  synthetic accounts and disposable D1; ordinary local data is unchanged.

Verification: `node scripts/test.mjs tests/outcomes.test.mjs
 tests/browser/outcomes.spec.ts` passes seven HTTP journeys and one Chromium
journey. Final `npm test` passes all 108 Node tests (including helper and migration
checks) and all 21 Chromium journeys with no failures or skips, including the real
five-minute OTP expiry and rate-limit windows. Final `npm run typecheck`,
`npm run build`, `npm run lint`, and `npm run format:check` pass.

Changes are committed locally on the current branch; no push or tracker mutation
is included.

---

# Outreach outcomes and school-need closure — 2026-10-20

Issue [#19](https://github.com/akbarsahata/alumni-platform/issues/19) is implemented
locally on branch `codex/issue-19-technical-spec` from starting commit `aac9f18`,
following [the agreed outcome specification](outreach-outcomes-spec.md). Changes are
in one local commit; nothing is pushed or deployed, no live email was sent, and the
issue remains open remotely until a separate tracker update.

## Behavior

- A committed introduction creates one `introduced` baseline per request using the
  earliest sharing time. Consent-only, pending/claimed, withdrawn and invalidated
  delivery never create outcomes. Subsequent staff shares do not reset the baseline,
  revision or history.
- Current directory coordinators **Catat hasil**; the recipient member
  **Konfirmasi hasil** or **Koreksi hasil**. Current states are introduced,
  help-confirmed, completed, or did-not-proceed. Confirmation covers the displayed
  revision, does not grant email consent, and becomes historical after a later edit.
  Append-only events retain actor ID/source, previous/current state, bounded note and
  UTC time. Notes are trimmed, 1-500 characters, required for records/corrections,
  and visible only to the recipient and current coordinators.
- Conditional writes recheck request access, owner or coordinator authority,
  approved membership for member actions, shared evidence and `expectedRevision` in
  one statement. Stale, competing or revoked-authority writes return 409 with no
  event or audit residue. Outcomes remain editable after opt-out, unavailability,
  staleness, expiry and closure. Suspended membership is read-only for member
  outcome actions; coordinator authority remains independent.
- Closure still uses `outreach_closure` as the one authority. It cancels unanswered
  requests and pending/claimed request or reminder notifications while preserving
  responses, introductions, outcomes and history. New consent is blocked after
  closure, but consent recorded before closure may finish delivery. Repeated closure
  conflicts.
- School need pages show response totals separately from mutually exclusive outcome
  buckets, `introducedTotal`, and closure time. School JSON/HTML/data remains
  aggregate-only. Primary audit adds `outcome-recorded`, `outcome-confirmed` and
  `outcome-corrected` with only event/actor/need IDs, action and UTC time.

## Persistence and interface

- Migration `0021_outreach_outcomes.sql` adds `outreach_outcome` and
  `outreach_outcome_event`, backfills existing shared requests once from the earliest
  `shared_at`, installs the first-share baseline trigger, append-only history,
  conditional revision validation, derived-projection guards and minimal audit
  trigger. There are no new bindings, secrets or environment variables.
- `app/db/outcome.repository.server.ts` owns outcome persistence;
  `app/outreach/outcomes.server.ts` was not needed because the thin workflow lives
  beside the existing outreach workflows in `app/outreach/outreach.server.ts`.
- The existing request API/page now returns the current outcome, revision, history and
  server-derived action permissions. The coordinator need API/page returns each
  request's outcome and history. `POST /api/outreach/requests/:requestId/outcome`
  and both page actions submit the shared strict schema. Unsupported methods remain
  405; mutations keep origin protection and private responses keep `no-store`.
- Existing request, coordinator need, school need and audit pages were extended with
  **Hasil bantuan**, **Tutup kebutuhan**, closure time and aggregate outcomes. No new
  dashboard, breadcrumb, navigation destination or email was added.

## Verification

- Migration `0021` first applied successfully to disposable D1 through the test
  runner. A separate disposable pre-0021 fixture verified one backfilled baseline
  using the earliest of two shared times and zero invented history events. It was
  then applied to ordinary local D1 with `npm run db:migrate`; existing local data was
  preserved.
- Focused `node scripts/test.mjs tests/outcomes.test.mjs tests/browser/outcomes.spec.ts`
  passes seven real Worker/D1/Better Auth HTTP journeys and the Chromium outcome
  journey. Coverage includes baselines, multiple shares, coordinator/member history,
  confirmation invalidation, corrections, combined roles, notes/validation, races,
  stale revisions, forged fields, role/ownership privacy, suspension read-only,
  no-store, hostile origins, closure/cancellation, post-closure/pre-expiry outcomes,
  pre-closure delivery, replacement needs and aggregate-only school projections.
- Final full `npm test` passes all HTTP suites and all 21 Chromium journeys with no
  failures or skips, including the real five-minute OTP expiry and rate-limit
  windows. Two earlier full runs exposed pre-existing browser pagination fragility
  as the fixture set grew (outreach need/request list and suspensions member queue).
  Those specs now use supported direct URLs or follow **Anggota berikutnya**; the
  final full run passed.
- `npm run typecheck`, `npm run build`, `npm run lint` and `npm run format:check`
  pass. Desktop and 390px outcome screenshots were visually inspected; the mobile
  layout has no horizontal overflow.
- Temporary localhost smoke on the migrated ordinary D1 returned 200/no-store for
  `/` and `/login`, and 401/no-store for signed-out `/outreach` and
  `/admin/outreach-audit`. Synthetic accounts and captured mail were used only in
  disposable integration state.

## Remaining boundaries

No deployment, remote migration, live mail, scheduled job, automated retention or
entire-account deletion is included. Outcome and event history is guarded as
append-only during normal operation; the separately authorized #20 manual
deletion/anonymization procedure must deliberately adjust those guards. Closure time
anchors the existing manual 12-month retention policy but expiry does not delete
anything automatically. Private clarification (#18) and deletion/retention (#20)
remain separate.

---

# Coordinator retry authorization review fix — 2026-10-20

PR [#26](https://github.com/akbarsahata/alumni-platform/pull/26) review comment
[discussion_r4320783352](https://github.com/akbarsahata/alumni-platform/pull/26#discussion_r4320783352)
identified a real revocation window in the pre-existing #17 introduction code.
Implementation is on `feat/school-representative-names-25` from `3afb631`.

- `retryIntroduction` previously checked the coordinator role before delivery, but
  `claimIntroduction` and `captureIntroduction` did not recheck it. A coordinator
  revoked between the access check and capture could still share the member email.
- `deliverIntroduction` now receives the initiating coordinator ID. Member-initiated
  delivery after consent passes null; coordinator retries pass the current account.
- Both conditional writes require the initiating coordinator to still hold
  `directory-coordinator`. If the role disappears after claim, capture returns no
  rows, no mail or sharing evidence is written, and the claim is released back to
  pending. Restoring the role allows a later retry to share exactly once.
- Added an HTTP regression that revokes the coordinator immediately after the claim
  via a disposable D1 trigger. It asserts `{ shared: false, pending: true }`, no
  captured mail, pending/unshared evidence and no `introduction-shared` audit event;
  after restoring the role, the retry shares successfully. No migration or
  environment change is required.
- Documentation in [outreach.md](outreach.md) now states the claim/capture recheck
  and the member-initiated exception.

Verification:

- Focused `node scripts/test.mjs tests/introductions.test.mjs tests/browser/introductions.spec.ts`
  passes 12 HTTP journeys and all three Chromium journeys.
- Full `npm test` passes six helper tests, 95 HTTP tests and all 20 Chromium
  journeys, with no failures or skips. An initial full run hit an unrelated 30-second
  timeout in the suspensions browser journey; the focused suspensions rerun and the
  complete rerun passed.
- `npm run typecheck`, `npm run build`, `npm run lint` and
  `npm run format:check` pass.

---

# School representative names — 2026-10-20

Issue [#25](https://github.com/akbarsahata/alumni-platform/issues/25) is implemented
in the local working tree from starting commit `db70831` on the current `master`
branch, following the [agreed specification](school-representative-names-spec.md).
Changes are uncommitted and unpushed; no deployment or live email occurred.

## Behavior

- School invitations now require **Nama perwakilan** (trimmed, 1-200 characters)
  through the shared JSON/form schema. The email-bound invitation stores the name
  and exposes it only to the matching authenticated recipient; guests and wrong
  emails retain 401/404 privacy. Captured invitation mail includes the name.
- Acceptance atomically consumes the invitation, grants only the stored role and
  sets `user.name` when the account has no name yet. An existing non-empty name is
  preserved; the primary administrator can correct it explicitly.
- **Kelola peran** (`/admin/roles`) now sets or corrects names for verified accounts
  with a current `staff` or `student` role, including direct role appointments.
  `POST /api/admin/representative-names` uses the same validation. No membership,
  application or expertise profile is required.
- The conditional name-change insert rechecks current primary authority and target
  eligibility. Successful changes write `representative_name_change` evidence
  (actor, target, old/new name and UTC time); repeated same-name submissions are
  no-ops. The primary audit view merges this evidence with existing history in a
  separate query to stay within D1's compound-SELECT limit.
- Staff selectors, school-need summaries/detail, introduction consent and captured
  introduction mail resolve the current verified account name, with the existing
  `Akun staf <id-prefix>` fallback for legacy unnamed accounts. Historical
  `school_need.staff_contact_name`, approvals, invitation bindings, staff-recipient
  IDs and consent/sharing evidence are not rewritten. Name correction preserves
  email, roles, membership and profile fields.
- Migration `0020_representative_names.sql` adds the nullable invitation name for
  legacy rows, extends invitation issue/accept/apply triggers, and adds the
  restricted name-change table and triggers. It was applied to ordinary local D1
  with `npm run db:migrate`; existing local data and legacy null-name invitations
  were preserved. No new environment variables.

## Verification

- Focused HTTP/browser journeys pass:
  - `node scripts/test.mjs tests/invitations.test.mjs tests/browser/invitations.spec.ts`
    — 4 HTTP and the named invitation Chromium journey.
  - `node scripts/test.mjs tests/representative-names.test.mjs tests/browser/representative-names.spec.ts`
    — 4 HTTP and 1 Chromium journey covering named acceptance, existing-name
    preservation, invalid input, primary-only correction, revocation, concurrency,
    legacy records, selectors, school needs, consent, captured introduction mail,
    audit privacy and preserved profile/membership data.
  - `node scripts/test.mjs tests/school-needs.test.mjs tests/browser/school-needs.spec.ts`
    — 5 HTTP and 1 Chromium journey.
  - `node scripts/test.mjs tests/introductions.test.mjs tests/browser/introductions.spec.ts`
    — 11 HTTP and 3 Chromium journeys.
  - `node scripts/test.mjs tests/roles.test.mjs tests/browser/roles.spec.ts`
    — 7 HTTP and 1 Chromium journey.
- Chromium evidence: `test-results/representative-names-desktop.png` and
  `test-results/representative-names-mobile.png` were visually inspected; the mobile
  layout has no horizontal overflow.
- Full `npm test` passes six helper tests, 94 HTTP tests and all 20 Chromium
  journeys, with no failures or skips. This includes the real five-minute OTP
  expiry and rate-limit windows.
- `npm run typecheck`, `npm run build`, `npm run lint` and
  `npm run format:check` pass.
- Ordinary localhost remains available after the migration: `/login` and `/` return
  200 with no-store, while signed-out `/outreach` and `/admin/roles` return 401 with
  no-store. Normal local data was preserved; all automated accounts and captured
  mail were synthetic.

The next local implementation frontier remains **#18** (private clarification).
Issue #25 is implemented locally; its code and evidence are not pushed.

---

# Introduction review fixes — 2026-10-20

Review remediation for commits `c8ada19`, `9556cec`, and `77f9856`, based on
`77f9856` on the current `master` branch. This section supersedes the earlier
pending-only withdrawal boundary. Changes are local; no push, deployment or live
email.

- Request consent-history queries now apply the same actor access predicate as
  request/need queries before selecting private sharing records.
- Consent API/form submissions bind `expectedStaffUserId` and
  `expectedMemberEmail` to the details shown to the member. Conditional insertion
  rejects changed values. A 409 refreshes the request loader; changed consent
  details remount the form with an unchecked box, requiring a fresh decision.
- Members can withdraw pending or claimed introductions until capture, including
  after expiry. Introduction capture rechecks current eligibility, consent, staff
  authority and email destinations in its conditional write. Local D1 mailbox
  insertion and sharing/audit evidence commit atomically: successful withdrawal
  prevents capture, and failed evidence persistence leaves no captured message.
- Migration `0019_atomic_introduction_capture.sql` adds the development-only
  introduction mailbox and extends eligibility/replacement invalidation to claimed
  consents. Ordinary local mail remains in KV; the protected mailbox projects the
  newest capture across both stores. D1 mailbox visibility is ten minutes; expired
  captures are removed lazily on subsequent introduction captures. No new config.
- Migration 0019 was applied to ordinary localhost D1 with `npm run db:migrate`.
  Existing local data was preserved. General live-provider delivery/recovery
  remains outside this slice; crashed claims remain withdrawable.

Verification:

- Stale recipient, claimed withdrawal and stale browser-state regressions were
  observed failing before their fixes. Public HTTP/mail assertions also verify
  that a sharing-evidence failure rolls back capture and an ordinary retry shares
  once.
- Focused `node scripts/test.mjs tests/introductions.test.mjs
tests/browser/introductions.spec.ts` passes 11 HTTP journeys and all three
  Chromium journeys. Mobile capture was visually checked; the browser verifies
  no horizontal overflow at 375px.
- `npm run typecheck`, `npm run build`, `npm run lint` and
  `npm run format:check` pass. Separate Standards and Spec sub-agent reviews of
  the staged diff against `77f9856` report zero actionable findings on either axis.
- Ordinary localhost smoke checks pass against the existing IPv6 development
  server: `/` and `/login` return 200; signed-out `/outreach` returns 401. The
  existing server and normal local data were preserved.
- Full `npm test` passes six helper tests, 90 HTTP tests and all 19 Chromium
  journeys, with no failures or skips. This includes the real five-minute OTP
  expiry and rate-limit window checks.

---

# Consented introductions — 2026-10-20

Issue [#17](https://github.com/akbarsahata/alumni-platform/issues/17) is
implemented locally on `master` from starting commit `db67c3d`, with implementation
commits `c8ada19` and `9556cec`. The code remains unpushed; issue #17 remains open
on GitHub. No deployment, remote provisioning or live email occurred.

## Consented introductions

- Interest and email-sharing consent are separate. After a member expresses
  interest, the request page shows an initially unchecked consent box naming the
  current verified staff recipient and the member's own account email. The
  response API remains interest/decline only; consent is an authenticated,
  origin-protected `/consent` action and may be added until expiry.
- `outreach_introduction` retains restricted evidence of consent, withdrawal or
  invalidation, the named staff recipient, delivery state and sharing time. The
  member email is not included in coordinator/student projections or general
  audits. Audit actions (`consent-recorded`, `consent-withdrawn`,
  `consent-invalidated`, `introduction-shared`, `staff-recipient-changed`)
  contain only actor/need IDs, action and UTC time.
- Consent immediately attempts one introduction to the named staff recipient
  through the existing captured-email abstraction. The claim rechecks approved
  membership, participation, availability, profile eligibility, active consent,
  request state, consent-before-expiry, current staff role and verified email, and
  that the account email still matches the consented email. Failed capture leaves
  the introduction pending for a coordinator retry; repeated/concurrent actions
  and retries cannot create a second share.
- Withdrawal is allowed while delivery is pending, including after expiry. A
  claimed delivery is in progress; a shared email cannot be recalled. A claim left
  by a process crash requires operator recovery, matching the #16 claimed-
  notification boundary. General provider recovery remains out of scope.
- Expiry blocks new responses and consent. Interest without consent expires without
  an introduction; a consent recorded before expiry may finish afterward only while
  eligibility and consent still hold.
- `outreach_staff_recipient` holds the current named introduction recipient. A
  directory coordinator can replace it on a sent need; the replacement invalidates
  pending consents and requires fresh member consent bound to the new recipient.
  Loss of the recipient's staff role pauses delivery; restoring the role resumes
  retries. Historical staff validation remains evidence of the need content, while
  sending/member-notification delivery checks the current recipient's role.
- Students and directory coordinators see sharing status (staff name/timestamps)
  but never member email. The introduction email goes only to the named staff
  account and contains member display/school name, email, need title, purpose and
  requested help; it excludes house, profile text and decline reasons.
- Migration `0017_outreach_staff_recipients.sql` adds the current recipient mapping,
  backfill, request-insert initialization and the revised approved-need view.
  `0018_outreach_introductions.sql` adds consent/sharing evidence, delivery state,
  partial uniqueness indexes and eligibility/replacement/audit triggers. There are
  no new environment variables. Both were applied to ordinary local D1 with
  `npm run db:migrate`.

## Issue #17 verification

- Focused `node scripts/test.mjs tests/introductions.test.mjs
tests/browser/introductions.spec.ts` passes eight HTTP journeys and three
  Chromium journeys. Coverage includes interest without consent, the initially
  unchecked consent box, captured-mail recipient/content, repeated and concurrent
  consent, withdrawal before/after sharing, consent/withdraw races, expiry,
  staff-role revocation and restoration, replacement before/after sharing,
  eligibility/email changes during queued delivery, privacy, origin protection and
  no-store responses.
- Chromium captures desktop and 375px evidence at
  `test-results/introductions-consent-desktop.png`,
  `test-results/introductions-consent-mobile.png` and
  `test-results/introductions-replacement.png`; the layouts were visually inspected.
- Full `npm test` passes six helper tests, 87 HTTP tests and all 19 Chromium
  journeys, with no failures or skips. The suite includes the real five-minute OTP
  expiry and production-equivalent limiter windows.
- `npm run typecheck`, `npm run build`, `npm run lint` and `npm run format:check`
  pass.
- Ordinary localhost remains available: `/login` and `/` return 200, and signed-out
  `/outreach` returns 401. Normal local data was preserved; only the documented
  migrations changed its schema. All automated accounts and captured mail were
  synthetic.

## Next implementation

The next local implementation frontier is **#18** (private clarification); #19
follows #17 and #20 follows both #18 and #19. Issue #17 remains open remotely and
its code is unpushed. Automated deletion/anonymization remains out of scope.

---

# Review fixes — 2026-10-20

A two-axis review of `9b58c3e` found standards and spec issues in the local #16
implementation. The fixes are local to `master`; no push, PR, deployment or live
email occurred. Issue #16 was closed on GitHub on 2026-10-19 UTC; the code remains
unpushed.

- Outreach reads now use explicit typed Drizzle projections and `db.batch`: the need
  workspace, request list, request/need detail, and aggregates no longer issue
  sequential raw reads. The school-need aggregate is read-only, so loading a school
  need no longer performs a reconciliation write; member request access still
  reconciles elapsed eligibility as the specification requires.
- Primary audit history is ordered by `occurred_at` then id, with a stable
  `occurredAt|id` cursor. `/outreach` paginates needs and requests independently
  through `needsAfter` and `requestsAfter`.
- Directory approval continuity is explicit. Approval evidence must match the
  current need version; historical directory approval survives its approver's
  departure, while sending, takeover and delivery still require an active
  coordinator assignment and the named staff contact's current verified role. The
  operating procedure in [outreach.md](outreach.md) states these conditions.
- Chromium coverage now includes reminder delivery, coordinator takeover and an
  expired request's read-only state, alongside the existing send/decline journey;
  HTTP covers the rejected response to an expired request.
- Verification: focused HTTP outreach journeys pass 10/10 and the two Chromium
  journeys pass. The full `npm test` suite passes (including six helper tests, the
  HTTP suites and all 16 Chromium journeys), as do `npm run typecheck`,
  `npm run build`, `npm run lint` and `npm run format:check`.

---

# Current handoff — bounded outreach implemented locally — 2026-10-19

The documentation frontier update was committed on `master` as `27134c6`, after
school-needs PR #23 merged at `48dea53`. Issue
[#16](https://github.com/akbarsahata/alumni-platform/issues/16) is now implemented
locally on the same branch. No push, PR, deployment or live email occurred for
this implementation. Issue #16 was closed on GitHub on 2026-10-19 UTC after the
review fixes; its implementation prerequisites #14 and #15 and review issue #24 are
closed.
The code remains unpushed.

## Bounded outreach

- Current directory coordinators use **Permintaan bantuan** to select individual
  eligible recipients for an approved need, send captured-mail requests, inspect
  private response status, retry pending notification capture, send one reminder
  after seven days, take over coordination and close needs.
- Enforce ten recipients per need, one request per member per need, and three new
  requests per member in a rolling 30-day window across coordinators and replacement
  needs. Atomic conditional writes serialize competing sends and responses.
- Members authenticate to see frozen terms and respond interested or declined;
  interest does not share email. Optional decline reasons remain private to the
  member and current directory coordinators. Requests expire after 14 days or at
  the deadline date's end in UTC, whichever is earlier. Retries retain that expiry.
- Opt-out, unavailability, deletion flags and suspension cancel unanswered requests
  and queued notifications; access/delivery reconciles elapsed profile staleness.
  Delivery rechecks eligibility, approvals, active coordinator authority and closure.
  Historical directory approval survives its coordinator's departure so an active
  replacement can continue organization-owned requests.
- Sending freezes need details. Closure cancels unanswered requests and retains
  historical responses; changed terms require a replacement need and fresh approvals.
  School need pages show aggregate counts only. Primary operators have a dedicated
  minimal audit screen, without implicit directory access.
- Migration `0015_outreach.sql` adds workflow records, views and atomic notification,
  audit, freeze and cancellation triggers. `0016_outreach_approval_continuity.sql`
  preserves valid historical directory approval after coordinator departure. Both
  were applied to ordinary local D1 with `npm run db:migrate`; disposable integration
  state remains separate. There are no new environment variables.

See [outreach.md](outreach.md) for the operating procedure, UTC deadline semantics,
manual reminder initiation and captured-notification recovery boundary. Consented
introductions (#17), private clarification (#18), outcomes (#19) and manual deletion
processing (#20) remain separate work. No automated deletion/anonymization is added.

## Issue #16 verification

- TDD used the already agreed real Worker/D1/Better Auth/captured-email HTTP and
  Chromium seam. Final focused verification passes ten HTTP journeys and two
  Chromium journeys, covering contact limits and races, response/decline privacy,
  expiry, reminder uniqueness, queued eligibility changes, takeover and revoked
  access.
- The Chromium journeys exercise desktop sending, a 375px member decline, reminder
  delivery, coordinator takeover and the expired-request read-only state, check
  school aggregate disclosure and horizontal overflow, and capture desktop/mobile
  screenshots that were visually inspected.
- Typecheck and production build pass. The post-implementation review is recorded
  above; it found and fixed read, audit, pagination and browser-evidence issues.
- Final `npm test` passes six helper tests, 79 HTTP tests and all 16 Chromium
  journeys, with no failures or skips. This includes the real five-minute OTP
  expiry and rate-limit windows. Lint, formatting and staged whitespace checks pass.
- Ordinary localhost remains available: `/login` returns 200 and signed-out
  `/outreach` returns 401. Normal local data was preserved; only the documented
  migrations changed its schema. All automated accounts and mail were synthetic.

## Next implementation

The next local implementation frontier is **#17** (consented introductions) and
**#18** (private clarification), both depending on #16. #19 follows #17; #20 follows
both #18 and #19. Issue #16 is closed on GitHub, but its code remains local and
unpushed; publish the local commits before claiming those prerequisites are delivered
remotely. See the
[implementation index](profiles-expertise-outreach-issues.md) and
[agreed specification](profiles-expertise-outreach-spec.md).

---

# School-needs baseline recorded before issue #16

The following behavior and verification describe the school-needs baseline. Its
workflow now also has the outreach freeze, closure and aggregate progress described
above. Historical results below do not replace the issue #16 verification record.

## Current behavior

- Guests retain the email-code form on `/`; signed-in pages use the shared,
  current-role grouped navigation in `app/components/site-navigation.tsx`.
  Staff, student and directory-coordinator roles see “Kebutuhan sekolah”; the
  primary administrator’s role preview changes menu appearance only and never
  grants server authorization.
- `/school-needs` accepts only school activity and student mentoring requests.
  Staff, students and directory coordinators can submit without alumni membership
  or an alumni profile. Each request records a required named contact linked to a
  currently email-verified staff account. No contact email is included in need or
  reviewer projections.
- The named staff representative validates their current need version. A separate
  directory coordinator approves only after staff validation. Database conditional
  writes and triggers recheck current roles, version, contact assignment and
  independence at the write boundary; a dual-role actor cannot supply both stages.
- Submitters see only their needs and approval status. The named staff contact and
  directory coordinators see only the appropriate review detail/queue; unrelated
  submitters and other school roles are denied. API, page and React Router data
  responses are private/no-store; mutations retain origin protection.
- Editing creates an immutable version snapshot, preserves prior approvals and
  creates minimal audit events containing actor ID, action, version and time only.
  Both current approvals are then required again. The workflow does not send
  outreach or email; broad alumni networking, jobs, business and event outreach
  remain excluded.

## Migration and local configuration

Migration `migrations/0013_school_needs.sql` creates the version, approval and
minimal audit tables plus write-boundary triggers; `migrations/0014_school_need_verified_contact_name.sql`
strengthens those triggers to verify the stored contact name. There are no new environment variables or credentials.

```sh
npm run local:setup
npm run db:migrate
npm run dev
```

The integration runner applies migrations to disposable D1 state. To use this
feature in ordinary local data, run the existing `npm run db:migrate`. The prior
implementation handoff did not record applying these migrations to the ordinary
local database; this documentation update does not verify that database's state.
Synthetic Better Auth sign-in uses the
existing captured-mail adapter; the school-needs workflow itself sends no mail.

## Verification boundary

The following results were recorded in the school-needs implementation handoff.
They have not been rerun for this documentation update and do not establish a new
verification result for the merged commit.

- Focused `node scripts/test.mjs tests/school-needs.test.mjs tests/browser/school-needs.spec.ts`:
  four real Worker/D1/Better Auth HTTP journeys and one Chromium journey pass.
- Full `npm test`: six helper tests, 68 HTTP tests and 14 Chromium journeys pass,
  with no failures or skips. Existing real five-minute OTP expiry is included.
- `npm run typecheck`, `npm run build`, `npm run lint`, and `npm run format:check`
  pass. CodeQL reports zero alerts. The parallel validation’s code-review backend
  was unavailable in this environment; no review comments were returned.
- The secret scan found no secrets in changed code/tests. No live email, deployment
  or hosted CI result is claimed.

---

# Historical handoff entries

The summaries below record earlier work. Their branch/frontier/UI statements are
historical and superseded by the current summary above.

# Profile refinements — 2026-10-07

The four local commits reviewed for this handoff are on `codex/profile-layout`,
ahead of the local `origin/master` ref. The branch has no configured upstream.
They have not been pushed or deployed.

| Commit    | Result                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eba3947` | Compared three responsive profile prototypes; retained the experiment on `codex/profile-layout-prototype`.                                                   |
| `008a4d3` | Adopted variant B, with three desktop columns, two tablet columns, a single mobile column and sticky save controls; made professional introduction required. |
| `4a1e9f6` | Combined participation and consent into one form checkbox and moved confirmation into “Status relevansi profil”.                                             |
| `79d4801` | Aligned the home link, page heading and browser title to “Profil & Keahlian”, including the browser-test link selector.                                      |

## Current profile behavior

- `/profile` uses the real authenticated loader and persistence workflow. The
  chosen layout has “Tentang Anda”, “Keahlian & bantuan” and “Partisipasi” panels,
  a maximum width of 1240px, two columns at widths up to 1000px, and one column at
  widths up to 700px. Identity, privacy and confirmation explanations collapse.
  The current page contains no prototype switcher or in-memory save stub.
- Professional introduction is required for every save, including when opted out.
  The server trims it and rejects missing, empty or whitespace-only values.
  Existing profiles with a blank introduction must be edited and saved before
  explicit reconfirmation. Availability notes, display name and locations remain
  optional. Introduction and availability notes have writing lines and examples.
- The single “Aktifkan partisipasi” checkbox explicitly consents to discovery and
  school requests. Saving maps it to both `participation` and `participationConsent`;
  JSON API callers still provide explicit consent separately. Existing checked
  participation persists on edits. Unchecking opts out. Email-sharing consent is
  separate for each introduction.
- “Konfirmasi profil masih benar” is a separate form inside “Status relevansi
  profil”, available only to approved members with an existing saved profile.
  Saves also confirm the profile. The existing 12-month rule and suspended-member
  read-only access remain in force.
- Searchable locations retain Indonesia-only cities and worldwide countries,
  escaped comma-separated storage and legacy-location preservation. No new schema
  migration or environment configuration is introduced by these four commits.

## Verification and next work

At `4a1e9f6`, the full suite passed: 4 helper tests, 59 HTTP tests and 10 Chromium
journeys; typecheck, production build, lint, formatting and pre-commit passed.
Standards and Spec reviews had zero actionable findings. The browser regression
covers initial save, edits while participating, immediate feedback, values after
reload, locations, availability, opt-out and confirmation placement. The rejected
save without the former second checkbox was reproduced; a separate database
persistence failure was not reproduced.

`79d4801` changes product copy and the matching browser-test selector. The recorded
full-suite result above predates that commit; this documentation alignment does not
claim a new test run. Issue #13 is complete; #14 and #15 are the next runnable
issues. See [profile layout decision](profile-layout.md),
[current specification](profiles-expertise-outreach-spec.md) and
[implementation issue index](profiles-expertise-outreach-issues.md).

The entries below preserve earlier implementation and verification history. Their
older field requirements, checkbox descriptions and branch names are superseded
by this current summary.

---

## Issue #9 — administrator-assisted email changes — 2026-10-06

Implemented Ticket 1.8 against the current `master` branch.

- Added a membership-administrator-only Bahasa Indonesia workflow that records an
  identity-check note and reason before sending a ten-minute verification token to
  the proposed email. The account holder must authenticate with the current address
  and verify the token through the account-bound route.
- Stored only the token hash. Conditional D1 updates and triggers enforce current
  administrator authority, target identity, expiry, single use and collision checks;
  successful changes preserve account ID, membership and assigned roles, then revoke
  existing sessions.
- Added request/result audit events with actor, reason, identity-check note and UTC
  timestamps, plus HTTP and Chromium coverage. See `email-changes.md`.

The full `npm test` suite passes all 54 HTTP tests and nine Chromium journeys. Focused
email-change journeys, lint, formatting, typecheck and build pass. No live email,
deployment or production changes.

## Issue #8 — membership suspension and review requests — 2026-10-06

Implemented the suspension/reinstatement slice on the current `master` branch,
against starting commit `936515d2297a754c29c9348fbe89e4b75459e5d1`.

- Added versioned status decisions with actor, private reason, separate member message
  and UTC timestamps. Conditional inserts and SQLite triggers atomically change
  membership, resolve outstanding requests and persist notification capture work.
- Membership reviewers can suspend/reinstate approved or initial trusted alumni from
  the existing Bahasa Indonesia review screens. Self/endorser decisions remain denied.
  The member list shows outstanding review requests; initial bootstrap alumni need no
  application to participate in this workflow.
- Current membership immediately controls endorsement reads/writes in existing sessions.
  Suspension preserves separately assigned school/privileged roles and email-code login.
  Members see status/messages and can request one review per suspension; uniqueness and
  current-suspension checks reject repeated, concurrent and stale submissions.
- Reviewer history retains prior application decisions and status/request history.
  Member projections omit internal status reasons, actor IDs and private resolution IDs;
  notification capture includes only member-facing text. See `membership-suspensions.md`.
- Added five HTTP journeys and one Chromium journey to the full integration harness.
  Focused execution omits the bootstrap-only journey; the full suite supplies that fixture.

Validation:

- Focused suspension HTTP/browser verification passed. The full suite initially found
  an ambiguous browser locator because the new status-reason label included the existing
  house-correction label. Distinguished the status label and verified both browser flows.
  Reusing already-mutated fixtures was unsuitable for bootstrap assertions; final
  verification uses fresh disposable fixtures.
- Final `npm test` passes all 51 HTTP tests and eight Chromium journeys with zero
  failures or skips, including initial trusted alumni, real five-minute OTP expiry,
  and production-equivalent rate-limit reset.
- Typecheck, build, formatting, advisory lint and staged whitespace checks pass.
- Independent Standards review found one ordinary-query convention violation; fixed it
  with typed Drizzle mappings/builders. Also removed the authorization import cycle and
  repeated reviewer reads. Final Standards and Spec reviews have zero actionable findings.
- Applied `0008_membership_suspensions.sql` to ordinary local D1 and confirmed
  `http://localhost:5173/login` returns 200. Synthetic automated state is disposable;
  normal data and the manual development server are preserved.

Changes are committed locally on `master`; no push, deployment, remote provisioning or
live email. Next: issue #9, administrator-assisted verified email changes.

# Session handoff

## Issue #7 — school representative invitations — 2026-10-05

Implemented Ticket 1.6 against starting commit
`41e622520bcfc945950cbbdf567c1e5bc531e25a` on the current `master` branch.
The implementation is committed locally; no push or PR.

- Added primary-only Bahasa Indonesia `/admin/invitations`, linked from role
  management. Invitations bind one normalized email to `staff` or `student`, with
  a required appointment reason and seven-day UTC expiry. Recipients need no
  existing account, alumni application or profile.
- Captured invitation mail links to `/invitations/:id`. Guests verify the invited
  email through existing email-code login and return to the invitation using a
  restricted local return path. GET never consumes the invitation; acceptance
  requires an explicit trusted-origin POST with no client-supplied role or actor.
- Added migration `0007_school_invitations.sql` and a typed Drizzle repository.
  Conditional acceptance rechecks verified email, expiry, unused state and issuer
  authority. SQLite triggers atomically retain acceptance, assign only the stored
  school role and audit any new grant. Concurrent/replayed requests lose with 409;
  a consumed invitation cannot restore a subsequently revoked role.
- Immutable invitation records retain issuer, recipient, role, reason and UTC
  issue/acceptance history. The primary-only audit view includes both invitation
  events alongside existing role history, with distinct stable pagination IDs.
  Existing per-request permissions keep school roles separate from alumni,
  endorsement, directory, finance, membership review and role-management access.
- Added the operator guide `school-invitations.md` and updated README. Local mail
  remains capture-only with its existing ten-minute latest-message retention;
  capture failures are reported while retaining the invitation link. Scheduled
  retries/live delivery remain future work.

Validation: focused invitation run passes four HTTP journeys and the new-recipient
Chromium journey. Final `npm test` passes all 46 HTTP journeys and seven Chromium
journeys, including actual OTP expiry and limiter reset. New coverage includes
issuance, no-alumni-application acceptance, wrong email, expiry, concurrency,
replay after role revocation, role/actor tampering, origins, privacy, audited UTC
history and staff/student permission isolation. All assertions use the agreed
HTTP/browser seam; expiry uses a guarded past-time fixture only in disposable D1.
Typecheck, production build, lint and formatting pass. Independent Standards and
Spec reviews each report zero actionable findings against the starting commit.

Applied the migration to ordinary local D1. The existing localhost server remains
available: login returns 200 and signed-out invitation administration returns 401.
Only synthetic test accounts and captured mail were used; no real appointments,
live email, staging/production changes or deployment. Next: issue #8.

## Issue #11 — shared account identity and logout — 2026-10-05

Implemented the user's selected option 1 against starting commit
`565356766209ed7f555083c3d53546ce9e8a8bdf` on `master`; code commit `c43925d`
is local, not pushed.

- A root loader projects the current session email into a shared `AccountBar` below
  the brand header. Every page displays the full email and a visible `Keluar`
  button. The bar stays visible while scrolling; long emails wrap on narrow phones.
  Signed-out visitors see `Anda belum masuk` and `Masuk`.
- Logout posts to the existing origin-protected `/logout` action, revokes the
  session and redirects to login. The home-specific duplicate identity/logout
  controls were removed. The direct logout confirmation page remains available.
- A wildcard page route returns 404 through the shared error layout so missing
  pages retain the account bar; denied pages likewise retain only the current
  viewer's identity. No account switching, role changes or broader navigation.
- Added two HTTP journeys and a Chromium journey for two separate sessions,
  navigation, denied/missing pages, guest state, logout revocation, scrolling and
  320px mobile wrapping. Screenshots of desktop/mobile were visually inspected.
  Updated the existing login journey to target shared logout or direct confirmation.

Focused account-bar HTTP/browser checks and the six reference HTTP journeys plus
reference browser journey pass. Build, typecheck, lint, formatting and commit hooks
pass. The first full run exposed a privacy fixture whose own email contained
`decline`; renamed that synthetic account and retained the original privacy
assertions. Final full suite verification is pending the timed authentication checks.
Independent Standards and Spec reviews report zero findings against the starting
commit.

The normal localhost server remains available: login 200 with guest bar/no-store,
and missing pages 404. No migrations or normal local-data changes. No push, PR,
deployment, live email, staging/production changes, or real account changes.
Issue #11 tracks the agreed scope; completion is pending final suite verification.

## Issue #6 — reference recovery and reviewed house corrections — 2026-10-05

Implemented Ticket 1.5 against starting commit
`2d56628a997ed13fb0f5e0ac9259b15542dcbbc2` on `master`. Implementation commits
`9ea6631` and `5ec8be1` are local, not pushed.

- Added explicit reference replacement/manual-review forms and APIs. Each recovery
  atomically creates a new immutable application revision; replacement also creates
  the new seven-day request. Old links, responses, endorsements and reviewer forms
  cannot act on the new revision. Previous evidence remains private reviewer history.
- Applicant house edits continue to invalidate prior evidence. New references must
  satisfy current approved membership and the corrected house. Existing sessions
  use the current verified house when checking endorsement eligibility.
- Added administrator-only approved-house correction with a fresh independent check,
  reason and applicant message. Correction plus new approval commit atomically;
  self/previous-endorser reviews, stale forms and concurrent duplicate corrections
  are denied. Bootstrap-only alumni use audited versioned corrections without
  inventing school identities/applications. Members cannot edit verified house.
- Added migration `0006_membership_corrections.sql`, typed Drizzle correction/history
  projections and Bahasa Indonesia screens. Notifications remain local captured
  email; internal check notes and reference feedback stay private. Operator workflow
  and endpoints are documented in `membership-corrections.md`.

Validation: `npm test` passes all 40 HTTP journeys and five Chromium journeys,
including all seven correction journeys (bootstrap fixture supplied by the roles
journey), actual OTP expiry and limiter reset. Focused correction/browser verification
also passes; focused runs explicitly skip bootstrap-only coverage when that full-suite
fixture is absent. Typecheck, production build, lint and formatting pass. Standards
review initially flagged ordinary SQL reads; corrected them to typed Drizzle builders.
Final independent Standards and Spec reviews report zero remaining findings against
the starting commit. A focused rerun launched during the full suite connected to the
shared test address with a different mailbox key and failed setup; it was rerun after
the full suite finished. No product failure was involved.

Applied the new migration to ordinary local D1; localhost login remains 200, private
applicant/reviewer pages remain 401, and the new API rejects unsupported GET with 405.
The existing localhost server and normal data remain available. No push, PR, deployment,
live email, staging/production changes, or real appointments. Next: issue #7.

## Issue #10 — Hono, Zod and Drizzle backend architecture — 2026-10-05

Implemented against starting commit `79dfbfc50fe00563183c1e8bff6772be0ea6b79b` on
`master`; implementation commit `59b52f6` is local, not pushed.

- Hono declares API/authentication routes and shared request policies, with React Router
  continuing to serve pages. Explicit method handling preserves existing 405 behavior,
  including HEAD requests that Hono otherwise dispatches to GET handlers.
- Shared Zod schemas validate JSON and form inputs in workflows after authorization.
  Conditional application/reviewer rules and Bahasa Indonesia validation messages remain.
- Operation-oriented Drizzle/D1 repositories encapsulate authorization, administration,
  applications, references and notification persistence. Workflows contain no direct SQL.
  Typed projections and parameterized conditional writes preserve private reads, current
  permissions and existing atomic triggers. Existing schema and data need no migration.
- See `backend-architecture.md` for module ownership and request flow. Issue #6 remains
  separate; this refactor changes no membership policy or mail-delivery configuration.

Final `npm test` passes all 33 HTTP journeys (seven roles, six membership, six references,
two backend regressions, one logout and eleven authentication) and four Chromium journeys.
Coverage includes malformed JSON/forms, method/status/origin/cache behavior, authorization
before validation, forged actor fields, concurrent writes, privacy, real OTP expiry and
rate-limit reset. Production build, typecheck, lint and formatting pass. Independent
Standards and Spec reviews against the starting commit report zero actionable findings.

The existing localhost server and normal local data remain intact; read-only checks confirm
login 200, private routes 401 and unknown API routes 404 with no-store responses. Tests use
synthetic accounts, captured mail and disposable D1. No deployment, production changes,
live email, push or PR. Issue #10 is verified complete.

## Issue #5 — authenticated same-house references — 2026-10-05

Implemented Ticket 1.4 against starting commit `fa9063596fc52e1b96999b6b67b81227476872cd`
on `master`; implementation commit `437952a` is local, not pushed. Issue #4 is verified closed.

- Added migration `0005_membership_references.sql` for revision-bound seven-day requests and
  immutable single-use responses. Conditional writes plus SQLite triggers enforce intended
  verified recipient, approved same-house alumni membership, no self-reference, current revision,
  expiry, explicit personal-knowledge attestation for endorsement, and independent decisions.
- Graduate applicants enter reference email at `/membership`; registered, unknown and ineligible
  emails receive identical confirmations and request capture. There is no searchable directory.
  Request emails contain only an authenticated link, with no applicant school identity.
- Added Bahasa Indonesia `/references/:requestId` response screen. Eligible references see only
  school-time name, graduation year, house, expiry and answered state. Different graduation years
  are allowed. Endorsement enables review without granting membership; decline/cannot-confirm
  sends a neutral manual-review-needed message and keeps comments/details private to reviewers.
- Extended the reviewer queue/detail view with private reference history. Unanswered requests wait
  until response/expiry. An administrator who endorsed cannot decide the application, including
  later revisions. Existing independent-check notes and audited administrator decisions remain
  required. Every application correction invalidates current reference/endorsement status while
  retaining prior history. Direct replacement/manual-review switching remains issue #6.
- Reference requests persist before capture; identical current unanswered-request retries can
  retry failed capture. Negative-response mail uses the existing notification outbox. Capture is
  local only, with latest-message ten-minute retention; scheduled/provider delivery remains later
  work. See `membership-references.md` for manual testing and operator details.

Focused validation: six HTTP journeys and the Chromium reference/administrator journey pass.
Coverage includes neutral addresses, all responses, same/different house and graduation year,
attestation, self/wrong/unapproved reference denial, API/page/data privacy, origin checks,
expiry/replay, stale revisions/endorsements, request/response concurrency and reviewer conflict.
Seven-day expiry is checked in HTTP data and exercised using a guarded time-boundary fixture in
only disposable test D1; all outcome assertions go through public HTTP. The browser check exposed
an ambiguous select label, fixed by explicit label association. Build, typecheck, lint and
formatting pass. Independent Standards and Spec reviews against the starting commit both report
zero actionable findings. The first full run passed all reference/role/membership/auth HTTP
journeys and four browsers, but the logout fixture collided with another process's synthetic
IPv6 /64 and hit 429 during setup. Confirmed the installed auth library normalizes IPv6 by
/64; isolated synthetic account subnets across processes without changing product limits.
The focused logout rerun passes. Incremental review covers the test helper fix.
Final `npm test` rerun passes all 31 HTTP journeys (seven roles, six membership, six references,
one logout, eleven authentication) and four Chromium journeys, including actual OTP expiry and
limiter reset. No failures. Test-helper fix is committed locally as `0d22a22`.

Applied the migration to ordinary local D1. Verified `localhost:5173/login` returns 200;
unauthenticated membership/reference/admin pages return 401. Existing localhost server/origin
and normal data remain intact. No real appointments, live email, staging/production provisioning,
deployment, push, PR or hosted CI result. Next: issue #6.

## Direct logout navigation fix — 2026-10-05

Opening `/logout` directly previously hit a loader that deliberately returned 405; the home-page
POST form worked. Added a Bahasa Indonesia confirmation page for GET, with logout still performed
through the origin-protected POST action. A focused HTTP regression verifies GET preserves the
session and confirmation clears the cookie/revokes that session. The Chromium login journey now
exercises direct navigation/confirmation plus the existing home-page logout. Both focused checks
pass; verified the running `localhost:5173/logout` now responds 200. Typechecking passes.

## Issue #4 — membership applications and independent manual review — 2026-10-05

Implemented Ticket 1.3 against starting commit `57198bad0122b6bf176d0e9c3aada8c9bc557649`
on the current `master` branch. Issue #3 is verified closed; the current issue #4 and parent
specification define this slice.

- Added migration `0004_membership_applications.sql` with one application per verified account,
  immutable school-identity revisions, private decision history, and a membership-notification
  outbox. Conditional writes and SQLite triggers apply current status, decision, alumni membership,
  and notification atomically; stale/concurrent/repeated transitions return 409.
- Added Bahasa Indonesia `/membership`, `/admin/membership`, and `/admin/membership/:userId`
  pages plus matching APIs. Graduates provide graduation year; former students provide attendance
  years and receive individual manual review. Exactly one valid house and a manual-review explanation
  are required. Pending/action-required/rejected applications can be corrected/resubmitted; prior
  versions and decisions remain retained. Approved/suspended members cannot overwrite membership
  through this application flow.
- Membership administrators record independent trusted-alumni or school-staff checks and audited
  reasons for approval/rejection, or request corrections. Self-review is denied. Applicants see only
  explicitly addressed messages/status; internal reasons, reviewer identities, and check notes stay
  private to authorized reviewers. Membership approval grants no privileged roles.
- Captured submission/action/decision email uses the existing local adapter. Notifications persist
  before capture, and capture failures retain pending messages without rolling back decisions.
  Live delivery and scheduled/provider retries remain future work. No administrator email per
  application. See `membership-review.md` for the operator workflow and local testing.
- Preserved the user's `localhost` development origin and running server. Fresh local setup defaults
  to localhost. Automated tests use separate synthetic keys and their own temporary configuration
  at `127.0.0.1:5173`, along with disposable D1/KV data.

Focused validation passes six membership HTTP journeys and the Chromium application/review journey,
covering all nine houses, former-student checks, action/rejection/resubmission/approval, privacy in
API/page/data routes, same-session role revocation, self-review denial, captured email, forged actors,
and stale/concurrent transitions. Typechecking, build, formatting, and advisory lint pass. Independent
Standards and Spec reviews both completed with zero findings. `npm test` passed once at the end:
24 HTTP journeys (seven roles/bootstrap, six membership, eleven authentication including real OTP
expiry/rate-limit resets) and all three Chromium journeys. No failures. Changes are committed locally
on `master`; no push, pull request, or hosted CI result is claimed.
Applied the new migration to the ordinary local database. Verified `localhost:5173/login` responds
200 and unauthenticated membership applicant/reviewer pages respond 401; `.dev.vars` remains set to
`http://localhost:5173` and the existing development server remains running.

No staging/production provisioning, deployment, real appointments, credentials, or live email.
Next: issue #5, same-house reference requests/responses. References, post-approval house corrections,
invitations, suspensions, and identity changes remain their separate slices.

## Remote seeding workflow — 2026-10-05

Added `seeds/seed.sql`, `scripts/seed.mjs` and `.github/workflows/seed.yml`.
Seed/runner/workflow changes trigger branch push runs. `master` selects the GitHub
`production` environment; other branches select `default`. `SEEDING_ENABLED` is false
in the workflow: validation and target reporting run, dependency installation and
remote execution are skipped. See `seeding.md` for isolated remote database secrets,
migration prerequisites and verified-account administrator appointment. The seed is
currently a harmless SELECT; no remote provisioning, seeding or deployment performed.

Validation: actionlint 1.7.12, formatting, advisory lint and typecheck pass; disabled
production/default paths succeed without credentials, mismatched branch targets and
enabled execution without credentials fail. Standards and Spec reviews: zero findings.
Full integration tests were attempted but failed with a pre-existing development server
listening on port 5173; the server was left running. No hosted workflow result claimed.

## Current state

Planning documents created on 2026-10-02. Application implementation has not started. No dependencies installed, remote resources provisioned, email sent, or deployment performed. Files are local workspace artifacts; a remote Git repository has not been created.

## Decisions carried forward

Cloudflare is the user's platform preference; Resend account and verified domain already exist. Proposed implementation: React Router/TypeScript Workers, D1, Drizzle, private R2, supported authentication library, Resend email. D1 replaces the earlier provisional PostgreSQL suggestion.

The accepted pilot covers reference-verified membership, private expertise discovery, school initiatives, manually reconciled IDR bank transfers, and impact updates. See pilot.md for operating defaults versus confirmed facts.

## Validation

Documentation-only session. Workspace inspected; no existing project code found. No build or runtime tests apply yet. Stack compatibility must be demonstrated in ticket 0.

## Next session

Implement ticket 0 from docs/tickets.md. Read AGENTS.md first. Use synthetic data and local email capture. No Cloudflare/Resend credentials are currently configured in this environment.

Before staging/live configuration, obtain the application domain, sender/reply-to addresses, organization-owned deployment access and the school's actual timezone. Do not ask for secret values in chat; use the environment's secret-configuration mechanism.

## Recovery to this device — 2026-10-03

The six planning documents were recovered from complete file-change records in the referenced cloud chat (01a0fcae-8c70-751a-9bfd-79ee68d860bd). The initial .gitignore and package.json were recovered from its scaffold command. This is a reconstruction from recorded contents, not a filesystem transfer or a move of the original chat. Any unrecorded cloud files are not included.

Ticket 0 was started after the planning session: empty app/routes, app/lib, app/db, workers, scripts, and tests directories and a package manifest were created. Dependency installation failed with EPERM connecting to the cloud proxy. No dependency versions or lockfile were recorded; no application source, migrations, or smoke script was recorded. The manifest commands are placeholders until implementation exists.

The earlier planning-only Current state and Validation sections describe the initial session, not the latest status. Ticket 0 remains incomplete. Build, typecheck, Worker serving, D1 queries, and auth session creation/revocation have not passed. No deployment or live email was recorded. Local Cloudflare authentication has not been checked.

Resume Ticket 0 in this local project directory. Read the project documents, install and pin compatible dependencies, implement the foundation, run its acceptance checks, and update this handoff. Preserve the accepted pilot scope. Do not reuse the failed cloud proxy configuration on this device.

## Current local repository verification — 2026-10-03

The recovered documents now live in `/Users/akbar/projects/alumni-platform/docs`. Earlier planning and recovery sections above are historical; this section records the current implementation state.

Ticket 0 compatibility checks pass locally:

- `npm run typecheck` and `npm run build` passed.
- `npm run dev -- --host 127.0.0.1` serves the React Router starter page at `http://127.0.0.1:5173/`; HTTP 200 and the rendered Cloudflare binding were verified.
- `npx wrangler d1 migrations apply alumni_ticket0 --local --config wrangler.compat.jsonc` applied `0001_ticket0_auth.sql` successfully.
- `npx wrangler dev --config wrangler.compat.jsonc --port 8788` serves the separate compatibility worker. `/health` returned `{ "ok": true, "query": "d1-query-ok" }`.
- Synthetic API checks passed for signup, login with a session cookie, authenticated session retrieval, invalid-password rejection (401), and logout/session invalidation. No real credentials or live email were used.

Ticket 0 remains incomplete against the recovered acceptance criteria: authentication and D1 are currently exercised through a separate compatibility worker rather than the main app; environment templates, the email abstraction/local capture, and complete development/deployment documentation remain to be implemented or verified. Dependencies have a package lock, but package.json version ranges are not exact pins. No login UI exists yet.

The recovered ticket list is historical planning input. Future specification and task generation will use the GitHub plugin per the user request; no GitHub generation or external action was performed during this document import.

## Ticket 1 specification and skill setup — 2026-10-03

Aligned Ticket 1 with the accepted interview, including mandatory house selection, same-house references, individual manual eligibility review, email-code login, and deferred MFA. The user accepted the browser/HTTP integration seam. Published the full specification through the GitHub plugin as https://github.com/akbarsahata/alumni-platform/issues/1 with ready-for-agent. The local copy is docs/ticket-1-spec.md.

Created AGENTS.md and docs/agents configuration for GitHub Issues through the plugin, the five default triage labels, and single-context domain documentation. No application implementation, deployment, live email, or task decomposition was performed in this step. Next: decompose issue #1 into implementation tickets when requested, retaining the outstanding Ticket 0 prerequisites.

## Ticket 1 decomposition — 2026-10-03

The user approved eight vertical slices. Published GitHub issues #2–#9 through the GitHub plugin, each with ready-for-agent, a parent-spec reference, and explicit blocking issue links. Native dependency operations were unavailable in the plugin; parent issue #1 was not modified. See docs/ticket-1-implementation.md for the index. The first available implementation issue is #2 (main-app email-code login). No implementation was started in this step.

## Issue #2 — main-app email-code login — 2026-10-03

Implemented Ticket 1.1 in the main React Router Worker: Better Auth 1.7.7 Email OTP with real D1/Drizzle, verified first and returning accounts, cookie sessions, logout revocation, and Bahasa Indonesia login/home/logout copy. Routes and identifiers use English (`/login`, `/logout`). Authentication proves email ownership only; membership and roles remain later slices. Password login and identity-changing auth routes are unavailable in the product Worker.

Completed the outstanding foundation setup for this slice: main-app local D1/KV bindings, rate-limit migration, exact dependency pins and lockfile, private random `.dev.vars` setup and safe example, email abstraction and restricted ten-minute local capture, local mailbox command, and reproducible browser/HTTP integration harness. See local-development.md for commands and configuration. No remote provisioning, deployment, real credentials, or live email.

Validation:

- `npm run typecheck` passes, including the browser test and Playwright configuration.
- `npm run build` passes. Local secret values were checked absent from emitted client/server code and source maps. The Vite plugin copies `.dev.vars` into ignored build/server for local preview; never distribute those local build secrets.
- Local migrations applied successfully with `npm run db:migrate`.
- `npm test` exercised the real Worker, D1, KV, and Chromium: browser journey passed; 10 of 11 HTTP journeys passed, including five-minute expiry, replay, concurrent consumption, returning login, logout invalidation, resend replacement, wrong-attempt exhaustion and origin/session/mailbox protections. One test assertion incorrectly expected `Retry-After`; the installed library emits `X-Retry-After`. Corrected that expectation; `node --test --test-name-pattern='production limiter' tests/auth.test.mjs` passes, including the fourth-send 429, `X-Retry-After`, and 61-second window reset. All 11 HTTP journeys and the browser journey have now passed. The full suite was run once; after correcting only the header assertion, the affected journey was rerun.
- Built Worker preview on port 4173 rejected `/__local/mail` with 404 even with the correct local operator key. Production builds disable capture and have no live email adapter.
- Two-axis code review against starting commit `87ec6c2b7e51adba8965552e7f5b2b6e9b99cfc3` completed with independent Standards and Spec agents: zero findings on either axis. The corrected rate-limit rerun subsequently passed.

Next: issue #3 (administrator bootstrap and role management slice); confirm its current tracker specification before implementing. It must use current database-backed identity and keep membership approval separate from email verification. Bootstrap and administrator role assignment remain their own later slices. MFA, staging/deployment, live email and membership features are outside issue #2.

## Issue #3 — administrator bootstrap and role management — 2026-10-03

Implemented Ticket 1.2 from GitHub issue #3 against starting commit `8b90757d1a0c0b2d3f5002db33df1f02025d3073` on the current `master` branch.

- Added migration `0003_roles_bootstrap.sql`: distinct privileged assignments, approved/suspended alumni membership with nine-house constraints, once-only primary appointment and UTC authorization audit history. SQLite triggers apply bootstrap and role changes atomically with their audit events; conditional role writes make identical concurrent/repeated requests no-ops.
- Added a private, local-only `npm run bootstrap -- /private/path/appointment.json` command requiring verified accounts, operator identity, reason and one valid house per trusted alumnus. No bootstrap HTTP endpoint or public role selection exists. See `administrator-bootstrap.md` for the complete operator procedure, account-ID retrieval, private appointment evidence and recovery boundaries.
- Added authenticated Bahasa Indonesia `/admin/roles` and `/admin/audit` interactions, primary-only account/audit APIs and a self-only `/api/access` permission response. The primary alone grants/revokes membership-administrator, finance-coordinator, directory-coordinator, staff and student roles. Primary succession is not exposed. The primary needs separately assigned roles for membership review, finance or directory access.
- Current D1 roles and membership are checked per request, including existing session cookies. Approved alumni, school roles and membership-administrator do not implicitly receive private directory/finance permissions. The Worker rejects mutations from missing/untrusted origins, including React Router data requests, and protected data is not cached.
- Extended the integration harness with disposable local D1/KV state under ignored `.wrangler/`, preserving ordinary development data and making a once-only bootstrap repeatably testable. Synthetic fixture files are private and removed with their run.

Validation:

- `node scripts/test.mjs tests/roles.test.mjs roles.spec.ts` passes all seven HTTP journeys plus the Chromium role/audit journey. Exercises invalid/partial/repeated bootstrap, all nine houses, all five role grants/revocations, same-session revocation, denied API/page/data-route disclosure, origin protection, forged actors and role escalation, concurrent retries, multiple-role isolation and older audit pagination.
- `npm run typecheck` and `npm run build` pass.
- Two-axis code review via independent Standards and Spec agents completed with zero findings on either axis.
- `npm test` passed once at the end: seven role/bootstrap HTTP journeys, all eleven authentication HTTP journeys (including real five-minute OTP expiry and production-equivalent limiter reset), and both Chromium browser journeys. No failures.
- `git diff --cached --check` passes.

No remote provisioning, deployment, live email or real appointments were performed. Bootstrap was exercised only in disposable synthetic databases; the ordinary local development database has not been bootstrapped. Run `npm run db:migrate` before normal development with the new routes. School-role invitations remain issue #7; membership applications/review, suspension and identity changes remain their later slices. Directory/finance capabilities are established here; their product records and workflows remain outside Ticket 1.

Next: issue #4 (membership application/status slice); read the current tracker specification before implementing.

## Formatting and relaxed linting — 2026-10-03

Added pinned Prettier, ESLint/typescript-eslint, Husky and lint-staged tooling. Prettier uses two spaces, double quotes, semicolons and the user's 100-column target. Existing supported project files have been formatted; generated files, local secrets/state, lockfiles and installed agent skills are excluded. SQL remains unchanged.

VS Code/Cursor workspace settings enable formatting on save with the recommended Prettier extension; other editors need their own save integration. `.editorconfig` provides common whitespace settings. ESLint recommended diagnostics and the 100-column code-length rule are advisory warnings; explicit `any`, non-null assertions and empty catch blocks are allowed. Formatting is separate from lint.

`npm ci` installs hooks through Husky's `prepare` script. The pre-commit hook formats staged files, runs warning-only lint, then runs typechecking and the existing full integration suite. Allow approximately five minutes and keep port 5173 available. Node requirements are recorded in package.json and local-development.md.

Setup checks: format/check, lint and build; a stdin lint probe confirms warnings exit successfully. The setup commit exercises lint-staged and the actual pre-commit typecheck/full-test workflow. No runtime behavior, remote resources or live email are changed.

## Push test workflow and README badge — 2026-10-03

Added `.github/workflows/tests.yml` (`Tests`) with push events for branches and a job condition covering `master` plus refs protected by branch protection/rulesets. Public GitHub branch metadata verified that only `master` currently exists and has no protection/rulesets, so it is included explicitly. No protection settings were changed. Tag pushes and other unprotected branches do not run tests; matching pushes are not cancelled by newer runs.

The workflow uses commit-pinned official checkout/setup-node actions, Ubuntu 24.04, Node 24, npm's lockfile/cache and Playwright Chromium/system dependency installation. It creates synthetic local configuration, then runs formatting checks, advisory lint, typecheck, build and the complete HTTP/browser suite with a 15-minute timeout. Read-only repository permissions and disabled persisted checkout credentials are sufficient. No remote credentials, provisioning, live mail or deployment are used. README links a native workflow badge filtered to `master` and `event=push`.

Workflow syntax/expression validation uses checksum-verified actionlint 1.7.12, and Prettier checks cover the new files. Local commit hooks exercise typechecking and the full test suite. Hosted execution starts when these commits are pushed; a local run does not establish a passing GitHub Actions result.

## Faster commit hook — 2026-10-03

Updated the pre-commit hook per the user's revised preference: staged-file formatting, advisory lint, and typechecking remain; the full test suite no longer runs on commit. GitHub Actions retains formatting, lint, typecheck, build, and full HTTP/browser testing as the CI quality gate. README and local-development.md describe the current behavior; earlier hook descriptions above are historical.

## School-inspired family identity — 2026-10-05

The interface now uses “Keluarga Alumni” at the user's request. The school website (https://www.smansumsel.sch.id/) informed the deep teal, restrained red and gold palette; the alumni interface retains its own layout and SS monogram. Shared header/footer, warm ivory surfaces, serif headings, responsive home layout, focus indicators and form/table styling apply across existing routes.

Added local shadcn/ui Button, Input, Textarea and Card components with pinned supporting dependencies and a shared class utility. The form components preserve native submission, labels and validation. TypeScript's shared path configuration and components.json support the component directory. The login email subject also uses the family identity.

Validation: typecheck, build, formatting and lint pass. Full local suite passes 25 HTTP tests and three Chromium browser journeys, including real OTP expiry. The login preview was visually inspected in Edge; localhost home returns HTTP 200. Standards review found zero material findings; Spec review caught the remaining email identity and duplicate login footnote, both corrected. Changes are local; no deployment or push performed.

## Profiles and school outreach local specification — 2026-10-07

Settled the profiles, expertise discovery, and school outreach scope through the design interview and saved it in docs/profiles-expertise-outreach-spec.md. The user confirmed the existing real Worker/D1/Better Auth/captured-email HTTP and Chromium testing seam. Automated deletion and anonymization are explicitly deferred; directory deletion requests immediately hide profiles and cancel pending outreach, with manual processing and retention procedures.

Updated AGENTS.md and docs/agents/issue-tracker.md to persist the project's new workflow: local specifications first, then flat descriptive implementation issues with specification references and explicit blockers. Parent specification issues, sub-issues, and decimal pseudo-subtickets are not used for new work. Existing issue structures remain historical references. Updated the document index and roadmap to point to the settled local specification.

This session changes documentation only. No implementation, GitHub issue creation, existing-issue restructuring, deployment, or live email occurred. Changes remain local and uncommitted. Next: review the local specification and, when requested, decompose it into flat implementation issues.

## Profiles and school outreach issue publication — 2026-10-07

The user approved the eight tracer-bullet slices and authorized publication. Checked existing issues for duplicates, then created flat GitHub issues #13–#20 through the GitHub plugin, all open and labeled ready-for-agent. Each body references the local specification, carries complete acceptance criteria, and names explicit blocking issue links. The plugin exposes no native dependency operation, so no native blocking edges were created. No parent issue was created or modified.

Index: docs/profiles-expertise-outreach-issues.md. Dependencies: #14 requires #13; #16 requires #14 and #15; #17 and #18 require #16; #19 requires #17; #20 requires #18 and #19. Initial runnable frontier: #13 (private expertise profile) and #15 (school needs and independent approval). Updated the specification, roadmap and document index to reference the published issues.

GitHub creation responses confirmed all issue bodies and ready-for-agent labels. No feature implementation, application tests, commit, push, deployment, or live email occurred. Documentation changes remain local and uncommitted. Next: implement a frontier issue when requested.

## Private expertise profiles — issue #13 — 2026-10-07

Implemented the owner-only `/profile` page and `/api/profile` read/save plus
`/api/profile/confirm`. Approved alumni can maintain optional display name,
professional introduction, city/country and availability note; select multiple
initial expertise tags and help types; explicitly consent to participation; pause
availability or opt out; and confirm current information. The home page links to
the profile for approved and suspended members. Suspended members retain their
own read-only view and see that they are ineligible; separately assigned roles
remain independent. Nonmembers, primary-only accounts and other privileged roles
receive no private-profile access. There is no member-ID profile route.

Membership identity is projected from the approved application revision and current
membership house, never from editable profile fields. Bootstrapped trusted alumni
without an application see an explicit missing-school-name notice rather than an
invented identity. Participation defaults off. Active participation requires tags,
help types, availability and explicit consent; the participation checkbox and consent
checkbox are separate. Saves confirm the profile; explicit reconfirmation is also
available. Eligibility is computed on each read using current membership,
participation, availability, required selections and a 12-calendar-month confirmation
anniversary (February 29 clamps to February 28). No scheduled job is required.
Future search/send issues must apply these same eligibility conditions at their own
access and conditional-write boundaries; this slice exposes member eligibility only.

Migration `0010_expertise_profiles.sql` adds private profile persistence and
membership authority triggers. Conditional repository writes recheck approved
membership atomically, returning a controlled conflict if suspension wins a race.
The migration was applied to disposable test D1 and ordinary local D1 via
`npm run db:migrate`. No new bindings, secrets, remote migration, deployment, or
live email are required. Ordinary `localhost:5173` remained HTTP 200 throughout.

Focused verification: `node scripts/test.mjs tests/profiles.test.mjs
 tests/browser/profiles.spec.ts` passes four HTTP tests and one Chromium journey
against real isolated Worker/D1/Better Auth/captured-email synthetic accounts.
Tests cover default-off participation, validation/consent, all availability states,
opt-out/edit/reconfirmation, forged ownership and membership fields, API/page/data
privacy, no-store, hostile/missing origins, current-session suspension, independent
roles, former-student years, and the 12-month boundary. Old confirmation timestamps
are fixture setup in disposable D1 only; all behavior assertions use supported HTTP
routes. Browser checks wait for actual save completion before subsequent edits.
Typecheck, production build, lint and formatting pass. Final Standards and Spec
reviews both have zero actionable findings. Final `npm test` passes all 58 HTTP tests and 10 Chromium journeys, including real
OTP expiry and rate-limit windows. Changes are committed locally on `master`; no
push or deployment was performed. Issue #13 is updated and closed through the
GitHub plugin after verification.

## Profile form feedback and structured locations — 2026-10-07

Follow-up to issue #13: profile saves and reconfirmation now show a dismissible
six-second Sonner toast at the top of the viewport, below the sticky account bar.
Errors also show a toast while retaining inline validation. Pending saves show
“Menyimpan…”. Each participation checkbox has its own Bahasa Indonesia description
of ticking and unticking it, including the distinction between stopping participation
and withholding consent, and the separate consent needed to share email.

Replaced free-text location inputs with optional searchable React Select multi-selects.
The user narrowed the city list to Indonesia only; countries remain worldwide. A
committed generated snapshot includes 889 Indonesian city/locality entries with
province labels and 250 country options with Indonesian labels. The source package
`country-state-city@3.2.1` is a development dependency, so the worldwide city database
is absent from runtime bundles. Regenerate with `npm run locations:generate` and
review the resulting snapshot when updating the package. Data source and attribution:
[country-state-city](https://github.com/harpreetkhalsagtbit/country-state-city), based
on [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database)
under ODbL-1.0. UI libraries: [React Select](https://react-select.com/) and
[Sonner](https://github.com/emilkowalski/sonner), with pinned versions in package.json.

The profile API now accepts/returns arrays for `city` and `country`. D1 still stores
TEXT: ISO country codes and country/province/city identifiers, each URI-escaped and
joined by commas. `encodeLocationList` and `parseLocationList` trim empty values,
deduplicate in selection order, and preserve delimiters, percent signs and Unicode.
Malformed escaping fails instead of silently corrupting saved data. Four direct
helper tests run with `npm run test:unit` and as part of the integration runner;
this helper seam was explicitly requested by the user.

Migration `0011_profile_location_selections.sql` adds a location-format discriminator
without changing existing fields. Legacy free-text values are normalized when an
unambiguous catalogue match exists. Otherwise they remain owner-visible legacy chips;
only that owner's existing legacy values may be retained, and members may remove or
replace them. Fresh city/country selections must match the catalogue, with at most
20 per field. No custom or foreign-city additions are accepted. A normal profile save
writes the new escaped comma-separated representation; reconfirmation leaves location
data intact. The migration is applied to ordinary local D1 and disposable test D1.
The settled local specification now records these refinements for subsequent issues.

Focused verification: `node scripts/test.mjs tests/profiles.test.mjs
 tests/browser/profiles.spec.ts` passes four helper tests, five real HTTP journeys,
and one Chromium journey. Coverage includes persistence of multiple locations,
foreign-city and fabricated-country rejection, old-format conversion/preservation/
removal, search selection, clear checkbox descriptions, repeated success notifications,
and toast positioning. A screenshot is captured at `test-results/profile-feedback.png`.
Typecheck, build, lint and formatting pass. Standards and Spec reviews report zero
actionable findings. Final `npm test` passes four helper tests, 59 HTTP tests and
10 Chromium journeys. The focused suite was repeated after shortening checkbox copy
and localizing removal labels; it also verifies that removing a selected country
survives save and reload. The final typecheck, build, lint and formatting pass.
Changes are committed locally on `master`, with no push. A pre-existing homepage
link edit is outside this follow-up commit. No remote migration, deployment or live
email is part of this change.

### Profile participation follow-up (2026-10-07)

- Reproduced an HTML profile save rejected when participation was checked but the second consent checkbox was unchecked. The single “Aktifkan partisipasi” checkbox now explicitly grants discovery/outreach consent and submits both existing workflow flags; API callers still require explicit consent. Existing opt-in choices persist on edits.
- Renamed the status section to “Status relevansi profil” and moved the separate “Konfirmasi profil masih benar” form inside it. Suspended members cannot confirm.
- Browser regression covers first save, opted-in edits (display name, introduction, availability note), immediate feedback and values after reload, locations, availability, opt-out and confirmation placement. A separate storage failure was not reproduced in the real local Worker/D1 flow.
- Focused verification passed: `npm run test -- tests/profiles.test.mjs tests/browser/profiles.spec.ts` (4 helper tests, 5 HTTP journeys, 1 Chromium journey). Typecheck, build and lint passed. Standards and Spec reviews: zero findings. Final full `npm run test` passed: 4 helper tests, 59 HTTP tests, and 10 Chromium journeys. Formatting also passed. No deployment or live email.

## Coordinator expertise discovery — issue #14 — 2026-10-07

Implemented Bahasa Indonesia `/directory`, eligible profile detail and
`/directory/tags` pages with matching Hono APIs and React Router data surfaces.
Current directory assignment is required on every request, including existing
sessions after revocation; primary and all other roles have no implicit access.
Search supports expertise, introduction, city/country labels, help type,
availability, graduation ranges and separate overlapping attendance ranges.
House and bulk-export filters/endpoints are unavailable. Explicit projections
omit email, house and unrelated membership review fields. Search pages return at
most 50 profiles with stable cursor links. Eligibility is shared with owner status
and rechecks approval, opt-in, availability, required fields, 12-calendar-month
confirmation and the deletion marker. Pending/rejected/nonmembers have no profiles
eligible for discovery; suspended, opted-out, unavailable, stale and marked records
are hidden from both searches and details.

Migration `0012_directory_taxonomy.sql` seeds existing stable tags and introduces
shared labels, versions, retirement/replacement and atomic audited mutations.
Retirement preserves selections; members choose replacement tags themselves.
Profile pages read the shared vocabulary and preserve only their own retired
selections. Conditional writes recheck coordinator authority, version and tag
validity. Minimal taxonomy evidence joins the general audit without profile content.
The first full-suite attempt caught D1's compound SELECT limit in the expanded
audit query; nested source grouping fixes it and the seven-test role/audit suite
passes. Standards review prompted shared eligibility consolidation; final Standards
and Spec reviews both report zero remaining findings.

Migration applied to ordinary local and disposable test D1; no new secrets or
bindings. `localhost:5173` remains usable (HTTP 200). No deployment, remote
migration or live email. The deletion marker anticipates #19, with no deletion UI
or automated removal added. Detailed operations: [directory-discovery.md](directory-discovery.md).

Focused command: `node scripts/test.mjs tests/directory.test.mjs
 tests/browser/directory.spec.ts` passes four location helper tests, five HTTP
journeys and one Chromium journey against real isolated Worker/D1/Better Auth/
captured email. It covers filters, former years, role and field privacy across
API/page/data, immediate eligibility changes, tag retirement/replacement, audit,
version conflicts, origins/no-store and current-session coordinator revocation.
Typecheck, build, lint and formatting pass.

During verification, an external workspace reset removed staged files. At the
user's request, recovered the complete reviewed implementation from Git snapshot
objects and verified it matches the staged tree. Work is on `codex/profile-layout`,
not `master`. The user requested committing locally and pulling `origin/master`
with rebase. The final `npm test` run passed four helper tests, 64 HTTP tests and all 11
Chromium journeys, including real OTP expiry (301 seconds). The rebase succeeded
without conflicts; the rebased implementation tree is identical to the reviewed
and tested tree. The local feature commit sits one commit ahead of `origin/master`
on `codex/profile-layout`, with no push. Typecheck and formatting were verified
again after exact snapshot recovery. Final handoff evidence was amended into that
local feature commit. Issue #14 is updated and closed through the GitHub plugin
after verification.

## Directory UI refinement — 2026-10-07

Inset native-select carets with a custom decorative arrow, tightened coordinator
page/filter/input spacing, separated expertise chips and action controls, and
introduced teal, gold and soft-red action priorities. Added pinned `lucide-react`
icons for add, rename, replacement, retirement, search and reset. Icon controls
retain Bahasa Indonesia accessible names and hover titles, keyboard submission,
42px targets and current pending-state disabling. Desktop tag actions align beside
the label; mobile actions wrap below it. Retirement retains its separate form.

Focused Worker/D1/Better Auth/captured-email suite passes five HTTP journeys and
one Chromium journey; typecheck, build and lint pass. Desktop and 390px mobile
screenshots were visually checked under ignored `test-results/directory*-ui.png`;
temporary capture lines were removed from the existing browser test afterward.

Directory responsive follow-up: expertise cards use three columns at 1200px+,
two at 700–1199px, and one below 700px. Search filters use three/two/one columns;
results use two columns or one on phones. The coordinator container expands up to
1180px. Checked 1440px, 820px and 390px Chromium layouts and absence of horizontal
overflow using temporary capture/assertion instrumentation, then removed it.
Focused five HTTP journeys and one Chromium journey pass.

## Shared form styling and directory locations — 2026-10-07

Directory Kota/Negara reuse the profile searchable multi-select controls, with
canonical repeated GET parameters and any-choice matching within each location
filter. Existing text filters remain supported for HTTP clients. Location selections
persist in the URL and survive search/reload. Directory fields omit helper subtitles;
profile descriptions remain available. Shared location component descriptions are
optional without dangling aria-describedby references.

Applied the compact teal/gold form language across existing pages via shared CSS
and UI color tokens: primary teal, secondary gold, destructive red, inset native
select arrows, compact inputs/button spacing, tinted page surfaces and separated
profile selection chips. Changes preserve current route/form behavior. Focused
five HTTP journeys and the Chromium directory journey pass, including location
selection and canonical filter parameters. Existing API tests also cover repeated
city/country choices. Final full `npm test` passes four helper tests, 64 HTTP tests and 11 Chromium
journeys, including the real 301-second OTP expiry check. Typecheck, build, lint
and formatting pass.

Result-card refinement retains red names with stronger emphasis, smaller grey
introductions and cohort text, individual grey city/country badges, and green-check
or amber-clock availability icons with accessible labels and hover titles. Checked
profile, role administration and login at 1280px/390px, plus directory results at
both widths; no horizontal overflow. Synthetic screenshot fixtures stay in ignored
test artifacts; no real account/session is used.

Final directory-focused verification after result-card refinements passes all five
HTTP journeys and the Chromium journey. Scoped the selected-location assertion to
the filter form because result badges now repeat the same location text. Native
input styles are excluded from the searchable control's inner text input so empty
location controls align with surrounding fields. All changes remain local.

## Global navigation prototype — 2026-10-07

User requested easier cross-menu access and breadcrumbs, suggesting the top bar.
Development-only throwaway variants now mount in the shared root on existing pages:
A direct tabs, B grouped dropdowns, C compact expandable menu panel. Existing page
loaders and authorization remain in place; menu visibility derives from current
account access. Parent breadcrumbs enable return to directory and membership
review lists. Floating switcher preserves `?variant=A/B/C` across navigation.

Per explicit user instruction, exploration is on `master`. No winning layout or
production rollout is decided. See [navigation-prototype.md](navigation-prototype.md)
for the question, run command and capture/cleanup plan.

Navigation prototype follow-up: integrated account email and sign-out into a right-aligned “Akun” menu across all three variants, removed the separate development account strip, and removed sticky positioning from the fallback account bar. No layout winner selected.

Account menu visual refinement: replaced the text trigger with a Lucide user-circle icon and chevron, retaining “Menu akun” as its accessible name. Email stays inside the dropdown. Sign-out uses a logout icon and a tinted red outlined action, with a solid red hover state.

Selected direction: B grouped menus, still under prototype refinement. Beranda uses a home icon. Account trigger is exactly 44×44px with a circular background. Group/account dropdowns are exclusive and close on outside click, Escape or navigation. Expand “Pratinjau peran” to simulate combined roles; URL parameters retain preview state. Preview changes menu visibility only, leaves server authorization intact, and disables sign-out. Finance/staff/student have no dedicated implemented menus yet. Final production promotion remains pending.

## Shared navigation selected — 2026-10-07

User selected option B and deferred breadcrumbs. Replaced the development-only
prototype with shared grouped navigation for all builds, using real account access.
Removed variants, role-preview switches, the floating switcher and the old account
bar. The complete exploration is preserved on local `codex/navigation-prototype`
at `b31b386f1c64b1b29add9b33d8f3333d7dc4940d`. This decision supersedes the pending
prototype notes above. See [navigation-prototype.md](navigation-prototype.md).

Primary-administrator refinement: the account dropdown now offers “Pratinjau peran”. It is hidden for every other account and remains based on real primary authority even while previewing other roles. The preview panel is off by default; enabled state and role combinations stay in memory and follow client navigation, reset on reload/account change, and stop immediately when current primary authority is absent. It changes menu visibility only; server authorization and sign-out use the real account. A close control restores real menus.

Page navigation cleanup: removed redundant Beranda links from route content, including membership, profile, directory and administration flows. Home remains available through the shared menu icon and brand. Links to related features and parent lists remain in place.

Guest homepage decision: `/` now renders the existing email-code login workflow alongside the welcome typography and school introduction. Guests have no menu bar. `/login` uses the same presentation and preserves invitation-return and email-change flows. Signed-in home removes the redundant hero and menu list, keeping a short welcome while actionable items are deferred.

Guest home and selected-navigation verification: typecheck, lint, formatting and
production build pass. Chromium at 1280px/390px confirms the HTML welcome and
login form on `/` and `/login`, no guest menu and no horizontal overflow. Real
captured-mail authentication passes all 11 HTTP checks, including the installed
301-second OTP expiry check, and the login browser journey. A clean disposable
Worker/D1 regression run passes six helper tests, 24 HTTP journeys (roles,
membership, account identity, invitations and directory) and seven Chromium
journeys, including primary-only preview and invitation return. Earlier ad hoc
runs reused an already-bootstrapped scratch database or omitted fixture generation;
these setup failures were resolved by the clean ordered fixture run. Browser
selectors now exercise grouped navigation instead of removed homepage links.
Changes remain local and uncommitted on `master`; no deployment or live email.
