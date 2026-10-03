# Local development and verification

Issue #2 integrates Better Auth 1.7.7 Email OTP with the main React Router Worker and Drizzle/D1. All routes and code identifiers use English; product copy uses Bahasa Indonesia.

## Setup

Use Node.js 22.12+ (or a supported newer Node release) and npm. Dependencies are exactly pinned and package-lock.json is committed.

```sh
npm ci
npm run local:setup
npm run db:migrate
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173/login. `local:setup` creates a private `.dev.vars` with separate random authentication and local mailbox keys, preserving any existing file. `.dev.vars.example` documents the names without credentials. Keep BETTER_AUTH_URL equal to the development origin, including its port. The committed D1 and KV IDs are local placeholders; no remote provisioning is needed. Wrangler persists synthetic D1/KV state under ignored `.wrangler/`.

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

Stop any development server using port 5173 before `npm test`. The harness starts the real local Workers application with D1 and KV bindings, runs browser and HTTP checks, and stops its Worker afterward. It applies local migrations and uses only fresh synthetic addresses. It uses a separate disposable D1/KV state directory under `.wrangler/`, removes that directory afterward, and preserves existing local data. Logs and generated test reports are ignored. Browser traces, videos and screenshots are disabled and generated test artifacts remain private and ignored.

The HTTP suite runs independent journeys concurrently and takes approximately five minutes: expiry is verified with the real five-minute clock, not by altering private database records. It verifies resend replacement, replay denial, verified account creation, returning login, cookie flags, logout invalidation, forged sessions, origin denials, local mailbox protection, disabled identity endpoints, three failed attempts and fourth-request rate limiting with window reset. Browser checks exercise Indonesian copy, English routes, login, returning login, logout, role assignment/revocation and audit navigation. The HTTP role suite exercises private bootstrap, all nine houses, role isolation, denied disclosure, origin protection, immediate revocation and concurrent retries.

To run one journey against an already running server, use `node --test --test-name-pattern='journey name' tests/auth.test.mjs` or run `node scripts/test.mjs tests/roles.test.mjs roles.spec.ts` for role HTTP/browser checks. The role browser fixture is created by the harness; `npm run test:browser` alone remains suitable for the login journey (`-- login.spec.ts`). Use `TEST_BASE_URL` for HTTP checks against a different local origin, and update BETTER_AUTH_URL to match. The browser suite uses the standard port 5173.

## Installed auth behavior

Better Auth Email OTP defaults: six digits, 300-second expiry, three allowed failed guesses, replacement on resend, and three requests per endpoint per IP per 60 seconds. The plugin's rate limiter is explicitly enabled even in development and stored in D1, so recreating the auth object does not reset counters. The Worker trusts only Cloudflare's `CF-Connecting-IP` for IP tracking; local integration clients supply synthetic addresses. Production Cloudflare overwrites that header at the edge. OTP values are hashed in the auth verification table. Database transactions are disabled for the D1 adapter; the installed adapter supplies atomic verification consumption and rate-limit updates.

References: [Better Auth Email OTP](https://better-auth.com/docs/plugins/email-otp), [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit). Installed package source and real HTTP verification determine the actual behavior.

## Build and deployment boundary

`npm run build` builds the Worker; `npm run preview -- --host 127.0.0.1` previews it locally. The built Worker disables local capture and fails closed on sending email. Live mail, domain configuration, secrets, resource IDs and deployment are outside this slice. A future deployment must configure a live email adapter and separate environment bindings first; never publish `.dev.vars`, `.wrangler/`, build-local secrets, or test artifacts. Do not run the deployment command for this local verification.
