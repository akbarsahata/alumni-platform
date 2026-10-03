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

5. From the repository root, run `npm run bootstrap -- /private/path/appointment.json`. The command is permanently restricted to Wrangler **local** D1, with no remote flag, public endpoint, shared bootstrap secret or public role selector. Production provisioning is outside this slice. A private temporary SQL file is escaped and removed afterward. Wrangler output is suppressed to keep appointment details private.
6. Sign in as the primary and open `/admin/audit`. Verify the appointment and each alumni event: actor account ID, named operator, target ID, reason, house where applicable and UTC timestamp. Keep appointment evidence privately and remove the input JSON when no longer needed.

Bootstrap is one database statement. SQLite triggers validate accounts and atomically create the appointment, approved memberships and audit history. A failure rolls back all of it. A singleton constraint rejects a second invocation, including a different primary ID. Do not delete bootstrap records or rerun it to transfer authority. Primary succession and adding more trusted members are outside this slice.

## Administration and permissions

Only the primary can open `/admin/roles` and grant/revoke roles on verified accounts, with a required reason of up to 1,000 characters:

| Role                     | Permission                   |
| ------------------------ | ---------------------------- |
| membership-administrator | Review membership            |
| finance-coordinator      | Access finance               |
| directory-coordinator    | Access the private directory |
| staff                    | Validate school content      |
| student                  | Propose student content      |

The primary appointment grants role management and authorization audit access only. Assign membership-administrator separately for membership review, and finance/directory separately as needed. Staff/student assignments here are explicit primary actions on verified accounts; email-bound invitations remain issue #7. The primary role cannot be assigned/revoked through the screen/API.

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
