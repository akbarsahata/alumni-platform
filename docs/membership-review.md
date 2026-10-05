# Membership applications and manual review

Issue [#4](https://github.com/akbarsahata/alumni-platform/issues/4) adds the local manual-review
workflow. Run `npm run db:migrate`, sign in at [localhost:5173/login](http://localhost:5173/login),
then open `/membership`. Keep `BETTER_AUTH_URL` in `.dev.vars` equal to your browser origin.
Ordinary development data and disposable automated-test data are separate.

## Applicant workflow

Supply your name while attending school, exactly one of the nine houses, and a brief explanation
for manual review. Graduates supply a graduation year. Former students who did not graduate
supply first/last attendance years; eligibility is evaluated individually. Do not submit identity
documents or detailed disciplinary histories.

Each account has one application with retained revisions. Pending, action-required, and rejected
applications can be corrected/resubmitted. Every correction returns the application to pending
review; decisions against earlier revisions fail. Approved or suspended membership cannot be
replaced through this workflow. Approved house corrections and suspension reviews are later slices.

Applicants see their revisions, status, and messages explicitly addressed to them. Internal reasons,
check notes, and reviewer identities are available only to membership administrators. Read captured
submission/action/decision email with `npm run mail -- email`. No per-application administrator email
is sent.

## Independent review

Follow [administrator-bootstrap.md](administrator-bootstrap.md) to appoint the primary administrator
privately. The primary grants `membership-administrator` through `/admin/roles`, including to themselves
if they will review. Primary status, alumni membership, school roles, and directory/finance roles do
not alone authorize membership review.

Reviewers open the paginated pending queue at `/admin/membership` and select an application.
Before approval or rejection, independently check school identity and eligibility through a trusted
alumnus or school staff. Record the source category and a concise note identifying who was consulted,
how the check was performed, and what was confirmed. The source may be an offline contact; this
screen records the check rather than sending a reference request.

Approve, reject, or request corrections. Every outcome requires an internal audited reason and a
separate applicant message. Approval/rejection also require independent-check notes. For a correction
request, explain the needed change in the applicant message without copying private review material.
Another administrator must handle a reviewer's own application.

Decisions retain actor, reason, source/check notes, revision, and UTC time. The detail URL remains
available to authorized reviewers after the application leaves the queue, with all previous versions
and decisions. Approval grants alumni membership with the reviewed house, without privileged roles.
Permissions are checked on each request and again inside the conditional write. Repeated/concurrent
decisions yield one success and a 409 for conflicting or stale attempts.

## Persistence, email, and verification

Migration `0004_membership_applications.sql` adds applications, revisions, decisions, and a membership
notification outbox. SQLite triggers atomically retain revision/current status or decision/membership
changes together with notifications. HTTP callers cannot supply the actor or applicant identity.

After commit, the development-only adapter captures pending notifications. Failure leaves the decision
intact and the message pending; the response reports this. Retrying a valid mutation attempts pending
capture without duplicating decision history. The mailbox stores only the latest message per recipient
for ten minutes. Scheduled processing, live delivery/provider idempotency, and deployment remain future
work.

```sh
node scripts/test.mjs tests/membership.test.mjs membership.spec.ts
```

The browser/HTTP journeys cover submission, action requests, rejection/correction/resubmission,
former-student approval, all nine houses, private-field and self-review denials, same-session role
revocation, forged actors, stale/repeated/concurrent transitions, and captured mail. Tests have a
separate `127.0.0.1:5173` configuration and disposable D1/KV state, preserving `.dev.vars` and normal
development data. Keep the test address free; a localhost server bound only to IPv6 can remain running.
Reference requests/responses are covered by [membership-references.md](membership-references.md).
Directory, finance, and initiative products are not added
by this slice.
