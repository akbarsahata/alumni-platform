# Bounded school outreach

Issue [#16](https://github.com/akbarsahata/alumni-platform/issues/16) implements the
outreach/response slice of [the agreed specification](profiles-expertise-outreach-spec.md).

## Workflow

- Current directory coordinators open **Permintaan bantuan** from the Direktori
  menu, choose an approved need, inspect candidate expertise profiles and send one
  individually selected request at a time. Other coordinators can inspect the
  organization record and use **Ambil alih koordinasi** to record an assignment
  change. Revoked coordinators immediately lose coordinator access. Historical
  independent approval remains valid when its coordinator leaves; the replacement
  must hold the current coordinator role before continuing delivery.
- Approved or suspended members find their own requests under **Permintaan bantuan**
  in the Pribadi menu. Captured email links directly to the authenticated request.
  Members can express interest or decline once; an optional decline reason is
  visible only to the member and current directory coordinators. Interest does not
  share email. Introduction/consent and clarification belong to #17 and #18.
- Each need has at most ten recipients, each member receives one request per need,
  and each member receives at most three new requests in a rolling 30-day period
  across all coordinators and replacement needs. Cancelled, declined and expired
  requests still count within that period. Conditional D1 writes serialize races.
- A request expires after 14 days or at the end of its opportunity deadline date
  (23:59:59.999 UTC), whichever comes first. All displayed timestamps are UTC.
  Delivery retries and reminders retain the original expiry.
- Sent need details are immutable. A coordinator can close a need, cancelling
  unanswered requests while retaining completed responses. Material changes require
  a new need, fresh independent approvals and fresh responses. Contact limits still
  apply to the replacement.
- School submitters and the named staff contact see only aggregate response counts
  on the existing need page. Recipient identities, individual responses and decline
  reasons are available only through coordinator/recipient-authorized projections.
- The primary administrator has a dedicated **Audit penjangkauan** screen with
  actor ID, action, need ID and UTC time; primary status grants no directory access.
  System cancellation events have no human actor. Audits contain no email, profile
  introduction or private reason.

## Captured notifications and reminders

Request creation atomically persists audit evidence and a notification intent.
The send action attempts local captured delivery. Failed capture leaves the intent
pending; **Coba kirim notifikasi** retries it. Atomic claims stop concurrent retries
from capturing the same intent twice. A claimed notification after a process crash
requires later operator recovery; general provider/crash recovery is outside this
slice.

After seven days, **Kirim satu pengingat** appears for an unanswered request with
no previous reminder. The action rechecks eligibility and expiry, atomically
records the one reminder intent and attempts captured delivery. Operators initiate
reminders from this screen; no scheduler or live mail delivery is configured.
A short response deadline can leave no reminder window.

The repository rechecks current recipient eligibility, approval evidence for the
current need version, active coordinator authority and closure before capture.
Directory approval authority was checked when the immutable approval was recorded, so
a later coordinator departure leaves the organization-owned approval valid; sending,
takeover and delivery still require an active coordinator assignment, as described
above. The named staff contact must still hold a verified staff role. Profile opt-out,
unavailability, deletion flags and membership suspension cancel unanswered requests
and pending/claimed notifications at the database change. Access/delivery also
reconciles elapsed profile staleness. Re-enabling a profile does not revive cancelled
requests. Completed responses remain historical records.

## Local setup and verification

Migration `0015_outreach.sql` adds requests, notification intents, closures, minimal
audits, current-eligibility views and cancellation/freeze/history triggers.
`0016_outreach_approval_continuity.sql` preserves historical directory approval
after coordinator departure while retaining current staff and sending-authority
checks. There are no new environment variables. Use the existing local setup and
captured-mail adapter:

```sh
npm run local:setup
npm run db:migrate
npm run dev
```

Focused verification uses disposable D1, real Better Auth sign-in, supported HTTP
routes and Chromium, with synthetic accounts:

```sh
node scripts/test.mjs tests/outreach.test.mjs tests/browser/outreach.spec.ts
npm run typecheck
npm run build
```

The full integration runner includes these journeys. Time/queue setup writes in the
focused tests are guarded to the runner's disposable D1 state; all behavior is
asserted through HTTP, captured mail or rendered pages. Ordinary localhost state
is separate. The handoff records actual verification results and commit boundaries.
