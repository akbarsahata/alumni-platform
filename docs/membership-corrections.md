# Reference recovery and house corrections

Issue [#6](https://github.com/akbarsahata/alumni-platform/issues/6) extends the
membership/reference workflows with explicit recovery and audited house correction.

## Applicant recovery

At `/membership`, a pending graduate applicant with a reference can replace it or
request manual review with a new explanation. These actions are available while
waiting and after expiry or a response. Requests still expire after seven days.
Replacement accepts an email with the same neutral response for every recipient;
no member lookup or private reference feedback is exposed.

Each recovery creates a new immutable application revision, copying the school
identity. Replacement creates a new seven-day reference request in that revision;
manual review records the explanation without a request. Old requests and responses
remain in reviewer history, but their links cannot read or act on the new revision.
Old administrator forms return 409. Applicant house edits through the existing
application form likewise create a new revision, requiring fresh review and
same-house eligibility for any new reference.

## Approved house corrections

A membership administrator opens `/admin/membership/<userId>`, including for a
trusted alumnus established through private bootstrap. The correction form requires
one valid house, a reason, an applicant-facing message, and **fresh independent
checks** through trusted alumni or school staff. Perform those checks against the
corrected house before submitting. Self-review and review by a previous endorser
are denied. Members cannot change their verified house through the application API.

The correction and fresh approval commit together. For members with an application,
a new revision and approval retain the old identity and decision history. The
atomic trigger temporarily removes/recreates the membership inside the statement;
no request can observe an intermediate state. Bootstrap alumni have no invented
school identity or application; their correction history records both houses,
reviewer, reason, fresh-check source/notes, and UTC time. Their correction count is
the expected version, starting at zero. Repeated corrections are versioned too.

The verified house remains unchanged until a valid review commits. Existing sessions
read the new house immediately, including when checking reference eligibility.
Concurrent or stale corrections return 409. Current membership-administrator
assignment and conflict checks are revalidated inside the conditional write and
SQLite validation trigger. School/finance/directory roles grant no correction rights.
Suspended membership is outside this correction flow (issue #8).

## API and local verification

- `POST /api/membership/reference-replacement`: `expectedRevision`, `email`.
- `POST /api/membership/manual-review`: `expectedRevision`, `explanation`.
- `POST /api/membership/reviews/<userId>/house-correction`: `expectedRevision`,
  `house`, `reason`, `applicantMessage`, `checkSource`, `checkNote`.

All mutations require authenticated verified accounts and the trusted origin.
Migration `0006_membership_corrections.sql` keeps recovery/correction history,
versions, requests, decisions, and notification outbox writes atomic. Capture uses
only the existing local email adapter; provider/scheduled delivery remains later work.
Replacement sends the new authenticated request; manual fallback and house correction
send applicant notifications without internal checks or private reference comments.

```sh
npm run db:migrate
node scripts/test.mjs tests/corrections.test.mjs tests/browser/corrections.spec.ts
npm run typecheck
npm run build
npm test
```

Tests run real Workers/D1/Better Auth with synthetic identities and captured mail in
isolated disposable data. Expiry uses a guarded time-boundary fixture there; assertions
use the public HTTP interface. The full suite also verifies bootstrap-only corrections.
The normal localhost origin and manual-testing data stay available.
