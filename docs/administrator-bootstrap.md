# Private administrator bootstrap and role management

Issue [#3](https://github.com/akbarsahata/alumni-platform/issues/3) establishes the primary administrator and initial trusted alumni. Membership applications, school invitations, directory records and financial records remain later slices.

## Local organization appointment

1. Run `npm run db:migrate` and start the local app. The organization independently appoints one primary administrator and checks each initial trusted alumnus's school identity and house through trusted alumni or school staff. Do not collect identity-document uploads.
2. Have the appointed people sign in through `/login` with email codes first. Email verification proves ownership only. Bootstrap cannot create or verify accounts. Use the restricted local mailbox for synthetic verification, as described in local-development.md.
3. Obtain each person's account ID from their own authenticated `GET /api/auth/get-session` response (`user.id`). Independently match these IDs to the organization appointment. The primary need not be an alumnus; include that person in `trustedAlumni` only if independently verified.
4. Create a JSON file outside the repository with private permissions (mode `0600`). Replace these placeholders with verified IDs and the actual operator identity and reason:

```json
{
  "primaryUserId": "verified-primary-account-id",
  "operator": "Organization-appointed operator name",
  "reason": "Organization appointment; independent school identity and house checks completed",
  "trustedAlumni": [{ "userId": "verified-trusted-alumnus-account-id", "house": "Komodo" }]
}
```

Every trusted alumnus must have exactly one house: Komodo, Lion, Rhino, Hornbill, Dove, Eagle, Dolphin, Shark or Mantaray. Duplicate IDs, missing/unknown houses, unverified/nonexistent accounts and blank reasons/operators are rejected. An empty alumni list is allowed, but once-only bootstrap cannot later add alumni; later members use the membership workflow.

5. From the repository root, run `npm run bootstrap -- /private/path/appointment.json`. The command is permanently restricted to Wrangler **local** D1, with no remote flag, public endpoint, shared bootstrap secret or public role selector. A private temporary SQL file is escaped and removed afterward. Wrangler output is suppressed to keep appointment details private.
6. Sign in as the primary and open `/admin/audit`. Verify the appointment and each alumni event: actor account ID, named operator, target ID, reason, house where applicable and UTC timestamp. Keep appointment evidence privately and remove the input JSON when no longer needed.

Bootstrap is one database statement. SQLite triggers validate accounts and atomically create the appointment, approved memberships and audit history. A failure rolls back all of it. A singleton constraint rejects a second invocation, including a different primary ID. Do not delete bootstrap records or rerun it to transfer authority. Primary succession and adding more trusted members are outside this slice.

## Remote appointment

Use this procedure for staging or production after the Worker is deployed, live email
works and the appointed people have verified their accounts. `scripts/bootstrap.mjs`
remains intentionally local-only; do not add a remote flag to it. Remote appointment
uses a private, reviewed SQL file and Wrangler's `d1 execute --remote` command.

1. Sign in at the deployed `/login` with the appointed primary email. Complete email
   verification. Live email must work first; bootstrap cannot create or verify an
   account.
2. Obtain the account ID from the authenticated
   `GET /api/auth/get-session` response (`user.id`). Do the same for each initial
   trusted alumnus. Independently match the IDs to the organization appointment and
   verify each alumnus's school identity and house. Never paste a session cookie or
   OTP into an issue, chat or commit.
3. Check that no appointment exists yet:

   ```sh
   npx wrangler d1 execute DB --remote --env staging --json \
     --command "SELECT singleton, primary_user_id, operator, reason, occurred_at FROM organization_bootstrap"
   ```

   Stop if a row exists. Reconcile it with the organization; never delete or overwrite
   an existing appointment to make a new one succeed.

4. Create a private SQL file outside the repository with mode `0600`. Replace the
   placeholders with verified IDs and the actual operator identity and reason. This
   example appoints one trusted alumnus; add more `json_object(...)` entries or use
   `json_array()` for none:

   ```sql
   INSERT INTO organization_bootstrap
     (singleton, primary_user_id, operator, reason, trusted_alumni)
   VALUES
     (1,
      'VERIFIED_PRIMARY_ACCOUNT_ID',
      'Organization-appointed operator name',
      'Organization appointment; independent school identity and house checks completed',
      json_array(
        json_object('userId', 'VERIFIED_TRUSTED_ALUMNUS_ACCOUNT_ID', 'house', 'Komodo')
      ));
   ```

   Every trusted alumnus must have exactly one house: Komodo, Lion, Rhino, Hornbill,
   Dove, Eagle, Dolphin, Shark or Mantaray. Double any single quotes inside the
   operator or reason text. The database triggers still validate verified accounts,
   houses, the singleton and the audit records atomically.

5. Review the private file, then apply it from the repository root:

   ```sh
   npx wrangler d1 execute DB --remote --env staging \
     --file /private/path/remote-bootstrap.sql --yes
   ```

   Run this in a private terminal. Wrangler may echo appointment details; do not paste
   the output into a public issue or commit. The command applies one statement; a
   failure rolls back the appointment, memberships and audit events.

6. Verify the appointment and audit history:

   ```sh
   npx wrangler d1 execute DB --remote --env staging --json \
     --command "SELECT singleton, primary_user_id, operator, reason, occurred_at FROM organization_bootstrap"
   npx wrangler d1 execute DB --remote --env staging --json \
     --command "SELECT user_id, status, house FROM alumni_membership ORDER BY user_id"
   npx wrangler d1 execute DB --remote --env staging --json \
     --command "SELECT action, actor_user_id, target_user_id, role, house, operator, reason, occurred_at FROM authorization_audit ORDER BY occurred_at"
   ```

7. Sign in as the primary, open `/admin/audit`, and verify the appointment and each
   alumni event: actor account ID, named operator, target ID, reason, house where
   applicable and UTC timestamp. Keep appointment evidence privately, then remove the
   private SQL file when no longer needed.

8. For production, repeat after the production deploy and live email are proven, using
   `--env production`, the production account IDs and a separate private file. Never
   copy staging IDs or reuse staging evidence.

The remote procedure is deliberately manual and review-gated: there is no public
bootstrap endpoint, shared bootstrap secret or remote flag on the local command. Do
not seed an appointment through `seeds/seed.sql`; use the reviewed file above.

## Administration and permissions

Only the primary can open `/admin/roles` and grant/revoke roles on verified accounts, with a required reason of up to 1,000 characters:

| Role                     | Permission                   |
| ------------------------ | ---------------------------- |
| membership-administrator | Review membership            |
| finance-coordinator      | Access finance               |
| directory-coordinator    | Access the private directory |
| staff                    | Validate school content      |
| student                  | Propose student content      |

The primary appointment grants role management and authorization audit access only. Assign membership-administrator separately for membership review, and finance/directory separately as needed. Staff/student assignments here are explicit primary actions on verified accounts; email-bound invitations remain issue #7. The same primary-only screen also sets or corrects **Nama perwakilan** for verified staff/student accounts, including direct appointments, without requiring membership or a profile. See [representative names](representative-names.md). The primary role cannot be assigned/revoked through the screen/API.

Email ownership, approved/suspended alumni membership and roles are separate records. Membership enables endorsement only while approved. School, membership-administrator and primary roles do not imply finance/directory access. Multiple explicit roles may coexist; revoking one leaves others intact.

Current roles and membership are read from D1 on every authorized request, including existing sessions. `/api/access` returns only the caller's account, membership and permissions. Future protected routes must enforce current permissions plus their own ownership/workflow restrictions on the server, rather than trusting client data or cookie claims. Membership review and suspension operations remain later slices.

Every role change inserts an audit event whose trigger changes the assignment in the same atomic statement. Conditional writes prevent concurrent/repeated identical requests from duplicating history; unchanged requests report no change. The server derives the actor from the session, requires the configured same origin, and validates the target, role, action and reason. Only the primary can read account assignments and authorization history. Audit pages/API provide 100 events per page and a continuation cursor. Protected responses use `Cache-Control: no-store`.

## Synthetic verification

```sh
node scripts/test.mjs tests/roles.test.mjs roles.spec.ts
npm run typecheck
npm run build
npm test
```

Stop other servers on port 5173 first. The harness creates disposable D1/KV state under ignored `.wrangler/`, applies migrations, signs in fresh synthetic accounts, exercises the actual private command, and checks results through authenticated HTTP/browser interactions. It deletes only its own state afterward, preserving ordinary development data and allowing repeat tests of once-only bootstrap. Browser fixtures are private and expire with the run. Role/browser checks need this harness; auth-only HTTP checks can still target a running server.
