# Local development and verification

Issue #2 integrates Better Auth 1.7.7 Email OTP with the main React Router Worker and Drizzle/D1. All routes and code identifiers use English; product copy uses Bahasa Indonesia.

## Setup

Use Node.js 22.22.1+ on the Node 22 line, or Node 24+, and npm (matching the pinned lint tooling requirements). Dependencies are exactly pinned and package-lock.json is committed.

```sh
npm ci
npm run local:setup
npm run db:migrate
npm run dev
```

Open http://localhost:5173/ for the guest login page; `/login` remains supported for invitation and identity-change redirects. `local:setup` creates a private `.dev.vars` with separate random authentication and local mailbox keys, plus a `RESEND_API_KEY=local-capture-only` placeholder so required-secret typing is satisfied, preserving any existing file. `.dev.vars.example` documents the names without credentials. Keep BETTER_AUTH_URL equal to the development origin, including its port. The committed D1 and KV IDs are local placeholders; no remote provisioning is needed. Wrangler persists synthetic D1/KV state under ignored `.wrangler/`. The top-level `wrangler.jsonc` environment is development and keeps `workers_dev` disabled; deployed environments are selected only through `CLOUDFLARE_ENV`.

## Formatting and linting

Prettier owns formatting: two spaces, double quotes, semicolons and a 100-column target. Run `npm run format` to format supported project files, or `npm run format:check` to check them. Generated files, local state, secrets, lockfiles and installed agent skills are excluded. SQL is left unchanged because no SQL formatter is configured.

The repository's VS Code/Cursor settings enable formatting on every save with the Prettier extension. Install the recommended `esbenp.prettier-vscode` extension when prompted. The optional recommended ESLint extension shows diagnostics in the editor. Other editors can use the same Prettier config and `.editorconfig`; they need their own format-on-save integration.

`npm run lint` runs ESLint on JavaScript and TypeScript. Recommended checks and the 100-column code-length rule are warnings, with no strict type-aware rules; explicit `any`, non-null assertions and empty catch blocks are allowed. Warnings do not block commits. `npm run lint:fix` applies available fixes when desired. Syntax/configuration errors still fail the lint command.

`npm ci` installs Husky hooks through the `prepare` script. Every commit formats supported staged files with lint-staged, runs advisory lint, then typechecks. Tests and build checks run in GitHub Actions; commits do not run the integration suite or need port 5173. lint-staged automatically stages its formatting changes and preserves unstaged edits. Editor formatting and the commit hook use the same config.

## Local mailbox

Codes never appear in product pages, API JSON, or logs. The local operator mailbox is available only when `ENVIRONMENT=development` or `test`, in development builds, on a loopback hostname, with the separate LOCAL_MAIL_KEY bearer token. Read a captured message with `npm run mail -- synthetic@example.test` in your local terminal. Alternatively, use a local operator HTTP client to GET `/__local/mail?email=synthetic@example.test` with `Authorization: Bearer <LOCAL_MAIL_KEY from .dev.vars>`. Do not paste the key into URLs or chat. The response has `to`, `subject` and `text`. It returns the latest message per address with ten-minute visibility. Most captures use KV; consented introductions use a local D1 mailbox so capture and sharing evidence commit atomically (migration `0019_atomic_introduction_capture.sql`). Expired D1 captures are removed lazily on subsequent introduction captures. There is no public mailbox page. Staging and production Workers use Resend instead and do not expose this endpoint.

Login requires a sign-in code and proves email ownership; it does not grant alumni membership or administrative roles. Applicants and administrators use the same authentication. Issue #3 adds the private appointment command and primary-administrator role management; see [administrator-bootstrap.md](administrator-bootstrap.md). Logout deletes the database session and clears its HttpOnly cookie. Password login, code-retrieval, password reset and self-service identity-change endpoints are not exposed by this Worker.

## Verification

```sh
npx playwright install chromium
npm run typecheck
npm run build
npm test
```

Keep `127.0.0.1:5173` free before `npm test`. A localhost development server bound only to IPv6 can stay running. The harness starts the real local Workers application with D1 and KV bindings and its own matching origin configuration, starts a loopback mock Resend endpoint, runs browser and HTTP checks, and stops both afterward. Introduction delivery exercises the real provider-attempt repository and migration path while mocking only the external Resend request; other test mail continues through local capture. It applies local migrations and uses only fresh synthetic addresses. It uses a separate disposable D1/KV state directory under `.wrangler/`, removes that directory afterward, and preserves existing local data and `.dev.vars`. Logs and generated test reports are ignored. Automatic browser traces, videos and screenshots are disabled; some journeys explicitly capture private diagnostic screenshots under ignored `test-results/`. See [browser diagnostics](ci-testing.md#timing-and-browser-diagnostics).

The full runner executes HTTP fixture suites sequentially, then auth HTTP, logout HTTP and Chromium concurrently. CI instead runs four isolated contexts in parallel, with HTTP before Chromium inside each context. OTP tests verify the persisted five-minute lifetime and age only disposable verification rows; rate-limit resets similarly age disposable limiter rows before exercising real HTTP endpoints. It verifies resend replacement, replay denial, verified account creation, returning login, cookie flags, logout invalidation, forged sessions, origin denials, local mailbox protection, disabled identity endpoints, three failed attempts and fourth-request rate limiting with window reset. Browser checks exercise Indonesian copy, English routes, login, returning login, logout, role assignment/revocation and audit navigation. The HTTP role suite exercises private bootstrap, all nine houses, role isolation, denied disclosure, origin protection, immediate revocation and concurrent retries.

To run one journey against an already running server, use `node --test --test-name-pattern='journey name' tests/auth.test.mjs` or run `node scripts/test.mjs tests/roles.test.mjs roles.spec.ts` for role HTTP/browser checks. The role browser fixture is created by the harness; `npm run test:browser` alone remains suitable for the login journey (`-- login.spec.ts`). Use `TEST_BASE_URL` for HTTP checks against a different local origin, and update BETTER_AUTH_URL to match. The browser suite uses the standard port 5173.

For membership HTTP/browser checks, run `node scripts/test.mjs tests/membership.test.mjs membership.spec.ts`.
See [membership-review.md](membership-review.md) for manual testing, decision history, and coverage.

## GitHub Actions

The `Tests` workflow runs on pushes to `master`, when a pull request is opened or reopened or its branch receives new commits, for merge queue groups, and for published GitHub Releases. A feature-branch push with an open pull request triggers one pull-request run, testing GitHub's proposed merge commit. Feature branches without an open pull request and raw tag pushes do not trigger tests. Every matching event gets its own run; newer pushes do not cancel earlier runs. Only the `tests` gate on `master` deploys staging, and only a published non-prerelease `v*` release can deploy production.

To enforce the pull-request quality gate, configure the target branch (normally `master`) in GitHub Settings → Rules → Rulesets, or branch protection. Require a pull request before merging and require the `tests` status check from GitHub Actions to pass. Select the check after this workflow has run on GitHub. Enable the up-to-date branch requirement if merges must pass against the latest target branch. The `merge_group` trigger also supports a merge queue. No manual workflow run is needed; editing this YAML alone does not configure GitHub's merge restrictions.

See [CI testing and parallel integration contexts](ci-testing.md) for the architecture, exact file ownership, fixture dependencies, new-test assignment rules and failure diagnosis.

CI uses Ubuntu runners and Node 24 in three test stages plus deployment:

1. Static checks: formatting, advisory lint, typecheck, production build and helper tests.
2. Four parallel integration contexts: `auth`, `membership`, `directory` (including school needs and representative names), and `outreach` (including introductions, outcomes and clarification). Each job installs Chromium and runs its HTTP fixture producers before its browser consumers against its own disposable Worker/D1/KV state. Tests inside a context remain sequential to preserve bootstrap and fixture dependencies. Directory and outreach also run the roles suite first to create the shared primary-administrator fixture.
3. The stable `tests` gate requires both stages to succeed, including every matrix job. Failed, cancelled or skipped prerequisites cannot pass this gate. Existing branch protection can continue requiring `tests`.
4. A successful `tests` gate on a push to `master` runs `deploy-staging` in the `staging` GitHub environment. A published non-prerelease `v*` release additionally runs `verify-release` and then `deploy-production` in the reviewer-gated `production` environment. Pull requests and merge queue runs never deploy, and production never deploys from a branch push.

Run one context locally with `npm test -- --context directory`. Keep port 5173 free; contexts run in separate CI runners, not concurrently in one checkout. Plain `npm test` and focused file arguments keep their existing behavior. The runner checks that every HTTP and browser test file is assigned to exactly one context (with the roles bootstrap repeated where required), so new files must be assigned in `scripts/test.mjs`.

Each integration job has a 15-minute timeout and `fail-fast: false`, so a failing context does not cancel the others. Local setup generates synthetic keys; no repository secrets, Cloudflare credentials, live email or deployment are needed. Husky is disabled in CI. OTP expiry checks assert the persisted five-minute lifetime and age only the disposable verification row; rate-limit reset checks similarly age only disposable persisted limiter rows. Parallel jobs repeat setup and dependency installation, trading runner minutes for shorter elapsed time. Hosted timing improvements must be measured after the workflow runs on GitHub.

The README badge is scoped to the latest `push` run for `master`; clicking it opens that branch's push workflow history. It starts reporting after this workflow reaches GitHub and the first push run completes. If the default branch is renamed, update the badge URLs and target branch rules together.

## Installed auth behavior

Better Auth Email OTP defaults: six digits, 300-second expiry, three allowed failed guesses, replacement on resend, and three requests per endpoint per IP per 60 seconds. The plugin's rate limiter is explicitly enabled even in development and stored in D1, so recreating the auth object does not reset counters. The Worker trusts only Cloudflare's `CF-Connecting-IP` for IP tracking; local integration clients supply synthetic addresses. Production Cloudflare overwrites that header at the edge. OTP values are hashed in the auth verification table. Database transactions are disabled for the D1 adapter; the installed adapter supplies atomic verification consumption and rate-limit updates.

References: [Better Auth Email OTP](https://better-auth.com/docs/plugins/email-otp), [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit). Installed package source and real HTTP verification determine the actual behavior.

## Build and deployment boundary

`npm run build` builds the Worker; `npm run preview -- --host 127.0.0.1` previews it locally. The built Worker fails closed when `ENVIRONMENT=development`; with `ENVIRONMENT=staging|production` and configured `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_REPLY_TO`, it sends through Resend.

`wrangler.jsonc` defines development, staging and production environments. Development and both deployed environments repeat the non-inheritable bindings, routes, variables, required secrets and observability settings. Staging D1/KV resources are provisioned; production resources remain guarded placeholders until the production phase.

`npm run deploy` intentionally fails without an environment. Use:

```sh
npm run deploy:staging -- --check
npm run deploy:production -- --check
npm run deploy:staging
npm run deploy:production
```

`--check` builds the selected environment, validates `build/server/wrangler.json`, removes any copied `.dev.vars`, and exits without applying migrations or deploying. A real deploy requires the environment's Cloudflare credentials and `PRODUCTION_URL` for production. The deploy script rejects placeholder resource IDs, missing custom-domain routes and missing required secrets, captures a production D1 Time Travel bookmark before migrations, applies remote migrations, uploads the Worker with a temporary secrets file, deletes that file immediately, records the deployment ID and Worker version in the job summary, and smoke-checks `/login`. Staging must return `X-Robots-Tag: noindex`; production must serve the application. Operators who already keep a private reviewed file can pass `--secrets-file <path>`; they are responsible for deleting that file.

The [Tests workflow](../.github/workflows/tests.yml) is the normal deployment path. A push to `master` runs `deploy-staging` after the stable `tests` gate. A published non-prerelease `v*` release runs `verify-release` and `deploy-production` after the same gate, using the reviewer-gated `production` environment. Pull requests, merge queue runs and prereleases never deploy. Staging and production use separate concurrency groups, and cancelling an in-progress migration is disabled. After acquiring its concurrency group, staging confirms the run is still the current `master` head and exits without mutations when a newer push superseded it. `PRODUCTION_URL` is a production environment variable, not a secret. Run the same origin check manually with `npm run smoke -- https://kasmanss.akbarsahata.id --expect-noindex`.

Deployed environments disable `workers_dev` and preview URLs. Non-production responses include `X-Robots-Tag: noindex`; this is not access control. Never publish `.dev.vars`, `.wrangler/`, build-local secrets, or test artifacts. The Vite plugin copies `.dev.vars` into `build/server/.dev.vars`; the deploy script deletes that copy before deploying. Local commands remove the ignored `.wrangler/deploy/config.json` redirect before running so a previous staging build cannot change local D1, KV or type generation. Do not run a real deployment command for local verification.

Use `npx wrangler deployments list --env staging` and `npx wrangler rollback <version-id> --env staging` for a code rollback. A rollback does not undo a migration. See [Cloudflare deployment](deployment.md) for the full runbook, D1 restore and remote bootstrap procedure.

For suspension/reinstatement and controlled review requests, see
[membership-suspensions.md](membership-suspensions.md). Focused verification:
`node scripts/test.mjs tests/suspensions.test.mjs suspensions.spec.ts`.

For coordinator discovery and shared expertise vocabulary, see
[directory-discovery.md](directory-discovery.md). Focused verification:
`node scripts/test.mjs tests/directory.test.mjs tests/browser/directory.spec.ts`.

## Browser startup and interaction

Use `gotoReady(page, url)` and `reloadReady(page)` from
`tests/browser/app-ready.ts` for hard navigation in browser journeys. The shared
layout exposes `body[data-hydrated="true"]` only after React attaches its handlers.
A visible server-rendered form or completed page load alone does not prove
hydration. Before hydration, changing a controlled select can be overwritten and
leave native validation blocking the subsequent submission. Wait for readiness,
not a fixed sleep or a longer success-message timeout.

`tests/browser/hydration.spec.ts` gates script delivery and verifies that the
helper waits before a school-history change. Client navigation from an already
hydrated page retains normal router behavior. Browser journeys must open the
relevant grouped menu before using its links and open the account dropdown before
checking email identity.

Local Python dependencies under `.venv/` are excluded from Prettier; do not
reformat installed third-party packages to satisfy project formatting checks.
