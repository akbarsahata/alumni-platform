---
name: role-bootstrap
description: Bootstrap the primary administrator or grant initial roles. Use when appointing a primary administrator, adding trusted alumni, or granting/revoking membership-administrator, finance-coordinator, directory-coordinator, staff or student roles locally or on staging/production.
---

# Role bootstrap

**Appointment** creates the one primary administrator in `organization_bootstrap`.
**Role grant** gives a verified account one of five roles through `authorization_audit`.
Appointment is once-only; role grants are repeatable. Adding a trusted alumnus is an
appointment-time membership, not a role.

Read [administrator bootstrap](../../../docs/administrator-bootstrap.md) before writing;
it is the authoritative runbook. Read [domain docs](../../../docs/agents/domain.md) for
vocabulary.

## Rules

- Reproduce locally first. Remote writes need explicit user confirmation.
- Every account must have `email_verified = 1`.
- The primary need not be an alumnus. A trusted alumnus needs exactly one house.
- The primary is not a `role_assignment`; never insert `primary` there.
- Grant and revoke roles as the signed-in primary through `/admin/roles` or
  `POST /api/admin/roles`. Do not hand-insert `role_assignment` on staging or production.
- Keep appointment JSON/SQL outside the repository, mode `0600`, and delete it after use.
- Stop if `organization_bootstrap` already has a row. Never delete or overwrite it.
- Keep OTPs and session cookies out of issues, chats and commits.

## Local appointment

1. **Start the local stack.**
   ```sh
   npm run local:setup   # only when .dev.vars is missing
   npm run db:migrate
   npm run dev
   ```
   Completion: `/login` serves locally.

2. **Sign in the intended primary and copy its account ID.**
   Open `http://localhost:5173/login`, request a code, and read it with:
   ```sh
   npm run mail -- <primary-email>
   ```
   After sign-in, read `user.id` from `/api/auth/get-session` or query:
   ```sh
   npx wrangler d1 execute alumni_local --local --json \
     --command "SELECT id,email,email_verified FROM user ORDER BY created_at DESC LIMIT 5"
   ```
   Completion: the intended row has `email_verified = 1`.

3. **Check that no appointment exists.**
   ```sh
   npx wrangler d1 execute alumni_local --local --json \
     --command "SELECT singleton,primary_user_id FROM organization_bootstrap"
   ```
   Completion: zero rows. Stop and reconcile if a row exists.

4. **Create the private appointment file.**
   Copy [the local template](reference/local-appointment.example.json) to a private path
   outside the repository (or the ignored `appointment.json`), mode `0600`. Fill the
   verified primary ID, operator, reason and `trustedAlumni` (empty array allowed; each
   entry needs a unique verified `userId` and one house).
   Completion: `test -r <file>` and no placeholder remains.

5. **Apply the appointment.**
   ```sh
   npm run bootstrap -- /private/path/appointment.json
   ```
   Completion: exit code 0.

6. **Verify and clean up.**
   ```sh
   npx wrangler d1 execute alumni_local --local --json \
     --command "SELECT singleton,primary_user_id,operator,occurred_at FROM organization_bootstrap"
   npx wrangler d1 execute alumni_local --local --json \
     --command "SELECT action,actor_user_id,target_user_id,operator FROM authorization_audit ORDER BY occurred_at"
   ```
   Sign in as the primary and open `/admin/audit`; the **Penunjukan administrator utama**
   event must appear. Delete the private appointment file.
   Completion: one bootstrap row, one `bootstrap-primary` event, private file gone.

## Local role grants

Targets must have signed in and be verified. The primary grants or revokes one role at a
time with a required reason.

1. Sign in as the primary and open `/admin/roles`.
2. Select the verified account, role and reason; submit **Berikan** or **Cabut**.
3. Verify the row and audit event:
   ```sh
   npx wrangler d1 execute alumni_local --local --json \
     --command "SELECT user_id,role FROM role_assignment ORDER BY user_id,role"
   npx wrangler d1 execute alumni_local --local --json \
     --command "SELECT action,actor_user_id,target_user_id,role,reason FROM authorization_audit ORDER BY occurred_at"
   ```
   Completion: the expected `role_assignment` row exists or is gone, the matching
   `grant`/`revoke` event is present, and a repeat submit reports no change.

Scripted local use with a primary session:

```http
POST http://localhost:5173/api/admin/roles
Origin: http://localhost:5173
Content-Type: application/json
Cookie: <primary-session-cookie>

{"targetUserId":"<verified-user-id>","role":"membership-administrator","action":"grant","reason":"Initial membership administrator"}
```

After bootstrap, add more trusted alumni through the membership workflow, not by
re-running bootstrap.

## Remote appointment (staging or production)

1. **Sign in the appointed primary** at the deployed origin with real email and copy the
   session's `user.id`. The account must be `email_verified = 1`.
2. **Check that no appointment exists.**
   ```sh
   npx wrangler d1 execute DB --remote --env staging --json \
     --command "SELECT singleton,primary_user_id FROM organization_bootstrap"
   ```
   Completion: zero rows. Stop if a row exists.
3. **Create the private SQL file.** Copy [the remote template](reference/remote-bootstrap.sql)
   outside the repository, mode `0600`, and fill the verified IDs. Double any single
   quotes in operator or reason. Use `json_array()` for no trusted alumni.
   Completion: no placeholder remains.
4. **Apply once.**
   ```sh
   npx wrangler d1 execute DB --remote --env staging \
     --file /private/path/remote-bootstrap.sql --yes
   ```
   Completion: one statement applied.
5. **Verify and clean up.**
   ```sh
   npx wrangler d1 execute DB --remote --env staging --json \
     --command "SELECT singleton,primary_user_id,operator,reason,trusted_alumni,occurred_at FROM organization_bootstrap"
   npx wrangler d1 execute DB --remote --env staging --json \
     --command "SELECT action,actor_user_id,target_user_id,operator,occurred_at FROM authorization_audit ORDER BY occurred_at"
   ```
   Open `/admin/audit` as the primary. Delete the private SQL file.
   Completion: one bootstrap row, one `bootstrap-primary` event, private file gone.
6. **Grant other roles through `/admin/roles` as the primary**, not direct SQL. Use
   `--env production` only after the production environment is provisioned and approved.

## Completion

Appointment is done when the bootstrap row, matching audit event, and `/admin/audit`
view all agree, and the private file is deleted. A role grant is done when the
`role_assignment` row and matching `grant`/`revoke` event agree and a repeat submit does
not duplicate history.
