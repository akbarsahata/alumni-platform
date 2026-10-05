# Same-house membership references

Issue [#5](https://github.com/akbarsahata/alumni-platform/issues/5) extends the
[manual-review workflow](membership-review.md). Apply local migrations with
`npm run db:migrate`. No real credentials or live email are required.

## Applicant and reference

Submit a graduate application at `/membership`, then enter the reference email in
the reference form. The confirmation is identical for registered, unknown, ineligible,
and self addresses. There is no membership search. Former students continue through
individual manual review.

Read the captured request using `npm run mail -- reference@example.test` within ten
minutes of capture. The request link remains valid for seven days. It contains no
applicant identity in the email. Open `/references/:requestId`, sign in using the
recipient email, and reopen the original link after login. The server requires current
approved alumni membership in the applicant's house and denies self-reference. The
reference sees only school-time name, graduation year, house, expiry, and whether the
request is already answered. Graduation years may differ.

Choose support, decline, or cannot-confirm. Support requires an explicit personal
knowledge attestation. Comments are private to membership reviewers. One response is
retained with the authenticated actor and UTC timestamp; concurrent or replayed
responses cannot overwrite it. Support enables review and grants no membership.
Decline/cannot-confirm sends a neutral manual-review message to the applicant. The
applicant sees no response details, comments, or reference actor.

## Independent review and obsolete requests

Unanswered requests wait outside the pending review queue until they are answered or
expire. Reviewers can still inspect the application's private history through its
detail URL. Expired requests become manually reviewable. A reviewing administrator
records the independent-check source, check notes, reason, and separate applicant
message using the existing review form. An administrator who endorsed an application
cannot decide it, including after corrections; another administrator must handle it.

Requests are bound to immutable application revisions. Every correction, including a
house change, invalidates the old request and removes its endorsement from current
review status. Earlier responses remain in private reviewer history. Direct reference
replacement and explicit manual-review switching are issue #6. This slice permits one
request per revision; an identical retry returns the neutral confirmation. Approved
members cannot correct their applications through this flow.

## Persistence and local verification

Migration `0005_membership_references.sql` adds requests and single-use responses.
Conditional statements and SQLite triggers enforce current state, recipient, house,
membership, expiry, personal knowledge, and independent decisions at the write boundary.
Requests persist before capture. Failed capture can be retried by submitting the same
email and revision. Decline/cannot-confirm messages use the existing notification outbox.
Scheduled delivery and provider retries remain later work. Capture stores the latest
email per address for ten minutes; request expiry is independent of capture retention.

```sh
node scripts/test.mjs tests/references.test.mjs references.spec.ts
npm run typecheck
npm run build
npm test
```

Tests use the accepted public Worker/browser/HTTP seam with real local D1, Better Auth,
and captured email in disposable state. The seven-day expiry is verified in response
data, then a guarded operator fixture advances one disposable request's expiry into
the past; subsequent assertions use HTTP, without waiting seven days or exposing a
test-only product endpoint. Ordinary local data and the localhost development server
are preserved.
