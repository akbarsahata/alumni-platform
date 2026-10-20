# School representative invitations

Issue [#7](https://github.com/akbarsahata/alumni-platform/issues/7) adds invitations
for `staff` or `student`. Apply `npm run db:migrate` before manual testing.

The primary administrator opens **Kelola peran → Undang perwakilan sekolah**
(`/admin/invitations`), enters a recipient email, **Nama perwakilan**, one school
role and an appointment reason. The name is trimmed and must contain 1-200
characters; JSON and form submissions share the same server validation. The email
need not have an account. The invitation is bound to that email (normalized to
lowercase), name and role and expires seven days after issuance in UTC.

Read the local captured invitation with `npm run mail -- recipient@example.test`.
The recipient opens `/invitations/:id`, follows **Masuk dengan kode email**, verifies
that same email and returns to the invitation. **Terima undangan** grants only the
stored school role. No membership application or alumni profile is required.
Opening a link or fetching it never consumes it. An existing signed-in account
with a different email must sign out and sign in with the recipient email. The
matching recipient sees the stored invitation name during acceptance; guests and
wrong emails cannot read it.

Acceptance is single use. Wrong emails cannot read invitation details; expired,
used, concurrent losing or replayed requests cannot grant roles. Strict acceptance
validation rejects supplied roles or actors. Acceptance assigns the stored role and,
when the account has no name yet, the stored representative name in the same
statement. An existing non-empty account name is preserved; the primary can use
[representative name management](representative-names.md) to correct it. A consumed
invitation cannot restore a role after the primary administrator revokes it through
the existing role screen.
School roles do not grant alumni membership, endorsement, directory, finance,
membership review, role management or audit access.

`school_invitation` retains the issuer, recipient email, role, reason, UTC issue and
expiry times and verified accepting actor/time. Its immutable identity and single
acceptance update are guarded by D1 triggers. Acceptance and any new role assignment
plus its authorization audit event commit atomically. `/admin/audit` and
`/api/admin/audit` combine invitation issuance/acceptance and existing role history;
only the primary administrator can inspect them. Invitation event IDs use a
33-character hexadecimal suffix so issue/accept events have distinct stable cursors.

The API uses `POST /api/admin/invitations` with
`{ email, representativeName, role, reason }`, and `GET`/`POST /api/invitations/:id`;
acceptance requires an empty JSON object.
Mutation requests require the trusted origin; all responses are no-store.
The anonymous page only offers login and discloses no recipient or role.
Login's return destination accepts only a local invitation path with a valid ID.

Mail is local capture only, with the existing ten-minute latest-message retention.
The invitation persists before capture. If capture fails, the primary screen reports
failure and retains a usable invitation link; a new invitation can be issued.
Scheduled delivery and live Resend remain out of scope.

Verification uses synthetic accounts, disposable D1/KV, real Better Auth and public
HTTP/browser routes. The expiry test constructs a past-time fixture only in the
disposable database; all outcome assertions use HTTP.

```sh
node scripts/test.mjs tests/invitations.test.mjs invitations.spec.ts
npm run typecheck
npm run build
npm test
```
