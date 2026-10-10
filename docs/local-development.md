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

Open http://localhost:5173/ for the guest login page; `/login` remains supported for invitation and identity-change redirects. `local:setup` creates a private `.dev.vars` with separate random authentication and local mailbox keys, preserving any existing file. `.dev.vars.example` documents the names without credentials. Keep BETTER_AUTH_URL equal to the development origin, including its port. The committed D1 and KV IDs are local placeholders; no remote provisioning is needed. Wrangler persists synthetic D1/KV state under ignored `.wrangler/`.

## Formatting and linting

Prettier owns formatting: two spaces, double quotes, semicolons and a 100-column target. Run `npm run format` to format supported project files, or `npm run format:check` to check them. Generated files, local state, secrets, lockfiles and installed agent skills are excluded. SQL is left unchanged because no SQL formatter is configured.

The repository's VS Code/Cursor settings enable formatting on every save with the Prettier extension. Install the recommended `esbenp.prettier-vscode` extension when prompted. The optional recommended ESLint extension shows diagnostics in the editor. Other editors can use the same Prettier config and `.editorconfig`; they need their own format-on-save integration.

`npm run lint` runs ESLint on JavaScript and TypeScript. Recommended checks and the 100-column code-length rule are warnings, with no strict type-aware rules; explicit `any`, non-null assertions and empty catch blocks are allowed. Warnings do not block commits. `npm run lint:fix` applies available fixes when desired. Syntax/configuration errors still fail the lint command.

`npm ci` installs Husky hooks through the `prepare` script. Every commit formats supported staged files with lint-staged, runs advisory lint, then typechecks. Tests and build checks run in GitHub Actions; commits do not run the integration suite or need port 5173. lint-staged automatically stages its formatting changes and preserves unstaged edits. Editor formatting and the commit hook use the same config.

## Local mailbox

Codes never appear in product pages, API JSON, or logs. The local operator mailbox is available only in development builds, on a loopback hostname, with the separate LOCAL_MAIL_KEY bearer token. Read a captured message with `npm run mail -- synthetic@example.test` in your local terminal. Alternatively, use a local operator HTTP client to GET `/__local/mail?email=synthetic@example.test` with `Authorization: Bearer <LOCAL_MAIL_KEY from .dev.vars>`. Do not paste the key into URLs or chat. The response has `to`, `subject` and `text`. It stores only the latest message per address and expires after ten minutes. There is no public mailbox page.

Login requires a sign-in code and proves email ownership; it does not grant alumni membership or administrative roles. Applicants and administrators use the same authentication. Issue #3 adds the private appointment command and primary-administrator role management; see [administrator-bootstrap.md](administrator-bootstrap.md). Logout deletes the database session and clears its HttpOnly cookie. Password login, code-retrieval, password reset and self-service identity-change endpoints are not exposed by this Worker.

## Verification

```sh
npx playwright install chromium
npm run typecheck
npm run build
npm test
```

Keep `127.0.0.1:5173` free before `npm test`. A localhost development server bound only to IPv6 can stay running. The harness starts the real local Workers application with D1 and KV bindings and its own matching origin configuration, runs browser and HTTP checks, and stops its Worker afterward. It applies local migrations and uses only fresh synthetic addresses. It uses a separate disposable D1/KV state directory under `.wrangler/`, removes that directory afterward, and preserves existing local data and `.dev.vars`. Logs and generated test reports are ignored. Browser traces, videos and screenshots are disabled and generated test artifacts remain private and ignored.

The HTTP suite runs independent journeys concurrently and takes approximately five minutes: expiry is verified with the real five-minute clock, not by altering private database records. It verifies resend replacement, replay denial, verified account creation, returning login, cookie flags, logout invalidation, forged sessions, origin denials, local mailbox protection, disabled identity endpoints, three failed attempts and fourth-request rate limiting with window reset. Browser checks exercise Indonesian copy, English routes, login, returning login, logout, role assignment/revocation and audit navigation. The HTTP role suite exercises private bootstrap, all nine houses, role isolation, denied disclosure, origin protection, immediate revocation and concurrent retries.

To run one journey against an already running server, use `node --test --test-name-pattern='journey name' tests/auth.test.mjs` or run `node scripts/test.mjs tests/roles.test.mjs roles.spec.ts` for role HTTP/browser checks. The role browser fixture is created by the harness; `npm run test:browser` alone remains suitable for the login journey (`-- login.spec.ts`). Use `TEST_BASE_URL` for HTTP checks against a different local origin, and update BETTER_AUTH_URL to match. The browser suite uses the standard port 5173.

For membership HTTP/browser checks, run `node scripts/test.mjs tests/membership.test.mjs membership.spec.ts`.
See [membership-review.md](membership-review.md) for manual testing, decision history, and coverage.

## GitHub Actions

The `Tests` workflow runs on every branch and tag push, when a pull request is opened or reopened or its branch receives new commits, and for merge queue groups. Every matching event gets its own run; newer pushes do not cancel earlier runs. A push to an open pull request produces both a push run and a pull-request run; the latter tests GitHub's proposed merge commit.

To enforce the pull-request quality gate, configure the target branch (normally `master`) in GitHub Settings → Rules → Rulesets, or branch protection. Require a pull request before merging and require the `tests` status check from GitHub Actions to pass. Select the check after this workflow has run on GitHub. Enable the up-to-date branch requirement if merges must pass against the latest target branch. The `merge_group` trigger also supports a merge queue. No manual workflow run is needed; editing this YAML alone does not configure GitHub's merge restrictions.

CI uses an Ubuntu runner and Node 24, installs locked dependencies and Chromium system dependencies, then checks formatting, runs advisory lint, typechecks, builds and runs `npm test`. The test harness applies migrations and uses disposable local D1/KV state. Local setup generates temporary synthetic keys; no repository secrets, Cloudflare credentials, live email or deployment are needed. Husky is disabled in CI because no commit is created by the workflow. The job has a 15-minute timeout to accommodate the real five-minute OTP expiry check.

The README badge is scoped to the latest `push` run for `master`; clicking it opens that branch's push workflow history. It starts reporting after this workflow reaches GitHub and the first push run completes. If the default branch is renamed, update the badge URLs and target branch rules together.

## Installed auth behavior

Better Auth Email OTP defaults: six digits, 300-second expiry, three allowed failed guesses, replacement on resend, and three requests per endpoint per IP per 60 seconds. The plugin's rate limiter is explicitly enabled even in development and stored in D1, so recreating the auth object does not reset counters. The Worker trusts only Cloudflare's `CF-Connecting-IP` for IP tracking; local integration clients supply synthetic addresses. Production Cloudflare overwrites that header at the edge. OTP values are hashed in the auth verification table. Database transactions are disabled for the D1 adapter; the installed adapter supplies atomic verification consumption and rate-limit updates.

References: [Better Auth Email OTP](https://better-auth.com/docs/plugins/email-otp), [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit). Installed package source and real HTTP verification determine the actual behavior.

## Build and deployment boundary

`npm run build` builds the Worker; `npm run preview -- --host 127.0.0.1` previews it locally. The built Worker disables local capture and fails closed on sending email. Live mail, domain configuration, secrets, resource IDs and deployment are outside this slice. A future deployment must configure a live email adapter and separate environment bindings first; never publish `.dev.vars`, `.wrangler/`, build-local secrets, or test artifacts. Do not run the deployment command for this local verification.

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
