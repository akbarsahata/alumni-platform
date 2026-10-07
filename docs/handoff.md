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
