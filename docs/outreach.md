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
  share email. Consented introductions are implemented in #17; private
  clarification remains #18.
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
above. The current named introduction recipient must still hold a verified staff
role. Profile opt-out,
unavailability, deletion flags and membership suspension cancel unanswered requests
and pending/claimed notifications at the database change. Access/delivery also
reconciles elapsed profile staleness. Re-enabling a profile does not revive cancelled
requests. Completed responses remain historical records.

## Consented introductions

- Interest is not consent. After expressing interest, the member sees an initially
  unchecked consent box naming the current verified staff recipient and the
  member's own account email. Consent is a separate authenticated,
  origin-protected action; it may be added at any time before the request expires.
  API consent submissions include `expectedStaffUserId` and `expectedMemberEmail`
  from the displayed request. Conditional insertion rejects a stale recipient or
  email; members must review the new details and check consent again.
- `outreach_introduction` retains restricted evidence: the member email, named
  staff user, consent time, withdrawal or invalidation, delivery state and sharing
  time. It is never exposed through coordinator/student projections or general
  audits. Audit events carry only actor ID, need ID, action and UTC time. Displayed
  staff names resolve from the current verified account identity; a primary name
  correction does not rewrite consent or sharing evidence.
- Consent immediately records the evidence and attempts one introduction through
  the captured email abstraction to the named staff recipient only. The delivery
  claim rechecks approved membership, participation, availability, profile
  eligibility, active consent, request state, consent-before-expiry, current staff
  role and verified email, and that the account email still matches the consented
  email.
- Failed capture leaves the introduction pending. A current directory coordinator
  can retry it from the need page. Withdrawal is allowed until capture, including
  while claimed and after request expiry. Capture rechecks eligibility, consent,
  staff authority and both email destinations in the conditional write. Migration
  `0019_atomic_introduction_capture.sql` adds the local introduction mailbox; its
  insert and sharing/audit evidence commit atomically, so withdrawal and capture
  cannot both win. A shared email cannot be recalled. A claimed row left by a
  process crash remains withdrawable; general provider recovery is outside scope.
- Introduction captures use D1; other local mail uses KV. The authenticated local
  mailbox returns the latest capture across both stores, with ten-minute visibility.
  Expired introduction captures are removed lazily on subsequent captures. This is
  development-only capture, not a live provider or a domain-retention purge job.
  Migration 0019 also invalidates claimed consents on profile/membership eligibility
  loss and staff replacement. It adds no configuration or remote resources.
- Expiry blocks new responses and consent. Interest without consent expires
  without an introduction. A consent recorded before expiry may finish afterward
  only while eligibility and consent still hold. An authorized introduction may
  also finish after the need closes, consistent with the accepted-arrangement rule;
  closure does not itself invalidate the member's consent.
- A sent need keeps its historical staff validation. The current introduction
  recipient is stored in `outreach_staff_recipient`. A directory coordinator can
  replace the recipient on a sent need; replacement invalidates pending consents
  and requires fresh member consent to the new recipient. Loss of the recipient's
  staff role pauses delivery; restoring the role allows retry.
- Students and directory coordinators see sharing status only (staff name and
  timestamps), never member email. The introduction email contains the member's
  display/school name, email and need title/purpose/requested help; it excludes
  house, profile text and decline reasons.

## Local setup and verification

Migration `0015_outreach.sql` adds requests, notification intents, closures, minimal
audits, current-eligibility views and cancellation/freeze/history triggers.
`0016_outreach_approval_continuity.sql` preserves historical directory approval
after coordinator departure while retaining current staff and sending-authority
checks. `0017_outreach_staff_recipients.sql` adds the current named introduction
recipient and replaces the approved-need view so historical staff validation
survives recipient replacement while current recipient authority is still checked.
`0018_outreach_introductions.sql` adds consent/sharing evidence, delivery state,
partial uniqueness indexes and eligibility/replacement/audit triggers. There are no
new environment variables. Use the existing local setup and captured-mail adapter:

```sh
npm run local:setup
npm run db:migrate
npm run dev
```

Focused verification uses disposable D1, real Better Auth sign-in, supported HTTP
routes and Chromium, with synthetic accounts:

```sh
node scripts/test.mjs tests/outreach.test.mjs tests/browser/outreach.spec.ts
node scripts/test.mjs tests/introductions.test.mjs tests/browser/introductions.spec.ts
npm run typecheck
npm run build
```

The full integration runner includes these journeys. Time/queue setup writes in the
focused tests are guarded to the runner's disposable D1 state; all behavior is
asserted through HTTP, captured mail or rendered pages. Ordinary localhost state
is separate. The handoff records actual verification results and commit boundaries.
