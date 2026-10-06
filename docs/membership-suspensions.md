# Membership suspension and review

Issue [#8](https://github.com/akbarsahata/alumni-platform/issues/8) adds suspension
and reinstatement to the existing membership reviewer screens. Apply local
migrations with `npm run db:migrate` before manual testing.

A membership administrator opens `/admin/membership`, chooses a member, and records
an internal reason plus a separate message for the member. The member list includes
initial trusted alumni who never submitted an application. Administrators cannot
decide their own membership or membership they endorsed. Reinstatement can follow
a member request or an independent administrator review.

Suspension changes alumni membership only. Existing cookies immediately lose
endorsement privileges; authenticated reference reads and writes check current
membership. Separately assigned school, finance, directory and administrator roles
remain under their explicit grant/revoke controls. The member can still use email
codes to sign in and open `/membership`.

A suspended member submits a brief review explanation through `/membership`. Only
one request can exist for a suspension, with at most one outstanding request per
account. A later suspension permits a new request. The administrator sees the
outstanding request in the member list, reads its explanation on the review page,
and restores membership with a reason and member message. Prior application
reviews, status decisions and resolved requests remain available to reviewers.
The member sees their own explanations, resolution state, and messages, but never
internal reasons or reviewer identities from status decisions.

The HTTP mutation routes are:

- `POST /api/membership/reviews/:userId/status`: reviewer-only, with
  `expectedVersion`, `outcome` (`suspended` or `approved`), `reason`, and
  `applicantMessage`.
- `POST /api/membership/suspension-review`: suspended account only, with
  `suspensionId` and `explanation`. The actor is always the current verified account.

The current version and suspension ID are returned in the self-only application
projection. Conditional writes recheck authority and state; migration
`0008_membership_suspensions.sql` commits the status decision, membership update,
request resolution and notification together. Stale decisions and repeated or
concurrent request submissions return 409. Captured action/decision emails contain
only the member-facing message; pending delivery does not undo committed decisions.
No administrator email is sent for review requests.

Focused verification uses disposable local Worker/D1/KV and synthetic accounts:

```sh
node scripts/test.mjs tests/suspensions.test.mjs suspensions.spec.ts
npm run typecheck
npm run build
npm test
```

The focused command skips the initial-trusted-alumni test when its bootstrap fixture
is absent; the full suite exercises it after the roles/bootstrap journey. Tests
cover existing cookies, reference denial, role isolation, email-code login while
suspended, duplicate and stale requests, decision races, private projections,
reinstatement, history, and the Bahasa Indonesia browser flow. No live email or
remote deployment is part of this slice.
