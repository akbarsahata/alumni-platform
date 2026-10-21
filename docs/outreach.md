# Bounded school outreach

Issue [#16](https://github.com/akbarsahata/alumni-platform/issues/16) implements the
outreach/response slice of [the agreed specification](profiles-expertise-outreach-spec.md).
Outcomes and need closure [#19](https://github.com/akbarsahata/alumni-platform/issues/19)
extend the same workflow; see [the outcome specification](outreach-outcomes-spec.md).

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
  share email. Consented introductions are implemented in #17, outcomes in #19,
  and private clarification in #18.
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
current need version, closure and the current named staff recipient's verified role
before capture. Coordinator-initiated introduction retries also recheck the
initiating coordinator's current directory-coordinator role at both claim and
capture, so losing that role after the initial access check prevents sharing.
Member-initiated delivery after explicit consent does not require a coordinator
role. Directory approval authority was checked when the immutable approval was
recorded, so a later coordinator departure leaves the organization-owned approval
valid; sending, takeover and coordinator-initiated delivery still require an active
coordinator assignment, as described above. Profile opt-out, unavailability,
deletion flags and membership suspension cancel unanswered requests and
pending/claimed notifications at the database change. Access/delivery also
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

## Outcomes and closure

- A committed introduction creates one `introduced` baseline per request. Consent
  alone, pending/claimed delivery, withdrawal or a replacement consent never creates
  or resets an outcome. The baseline uses the earliest sharing time.
- The current outcome is one of **Sudah diperkenalkan**, **Bantuan dikonfirmasi**,
  **Selesai**, or **Tidak berlanjut**. Current directory coordinators use
  **Catat hasil**; the recipient member can **Konfirmasi hasil** or **Koreksi hasil**.
  Confirming records agreement with the displayed revision and does not grant email
  consent. A later coordinator record or correction makes the earlier confirmation
  historical rather than relabelling the changed value as member-confirmed.
- Human changes are append-only events with actor, source, previous/current state,
  optional bounded note and UTC time. Coordinator records and member corrections
  require a trimmed 1-500 character note; confirmation needs no note. Notes are
  visible only to the recipient and current directory coordinators and must describe
  the arrangement, not contact details or private clarification.
- Every mutation supplies the displayed revision. Conditional insertion rechecks the
  request, current outcome revision, actor ownership or current coordinator role,
  membership status and shared evidence in one write. A stale or competing edit
  returns 409 with no event or audit residue; reload and review before retrying.
  Confirmation advances the revision. Outcomes remain editable after opt-out,
  unavailability, staleness, request expiry and need closure. Suspended membership
  keeps the existing read-only member boundary; separately assigned coordinator
  authority remains independent.
- **Tutup kebutuhan** remains the only closure authority. Closure atomically cancels
  still-unanswered requests and their pending or claimed request/reminder
  notifications, while preserving declined/interested responses, introductions,
  outcomes and history. Repeated closure returns 409. Closure blocks new sends,
  responses, reminders and new sharing consent, but a consent recorded before
  closure may still finish delivery under the existing eligibility checks.
- School need pages show aggregate response counts plus mutually exclusive current
  outcome counts (`introduced`, `helpConfirmed`, `completed`, `didNotProceed`), the
  distinct `introducedTotal`, and closure time. Outcome buckets sum to the distinct
  requests with shared evidence; response counts are never added to outcome counts.
  School projections contain no request/member IDs, names, notes, authors, emails or
  individual timestamps. Primary audit events distinguish `outcome-recorded`,
  `outcome-confirmed` and `outcome-corrected` but retain only event/actor/need IDs,
  action and UTC time.

## Private clarification

- Each request has one private clarification thread on the authenticated request
  page. The recipient and any current directory coordinator can read it and post
  plain-text messages of up to 2,000 characters. Each message is timestamped and
  attributed only as **Alumni**, **Koordinator direktori**, or **Anda**. Author
  account IDs and emails are not projected to either party.
- Clarification is separate from responding and consent. Posting never changes the
  request status, decline reason, deadline, need version or fields, consent, or
  introduction evidence. New messages are accepted only while the request is
  pending or interested, unexpired, and its need is still open. Declined, cancelled,
  closed, and expired requests keep the thread readable but read-only.
- Member messages notify the request's current assigned coordinator; coordinator
  messages notify the recipient. Notification mail contains no message text, need
  details, member name, school name, or account email. It links to the authenticated
  request. If the assigned coordinator no longer holds the role, no clarification
  mail is sent; the thread remains available to current coordinators. Self-notify is
  skipped. Capture is best effort, with no clarification outbox or retry.
- Staff and students never receive clarification text or identities. The need
  workspace links to the request page but does not render the thread. Primary
  administrators see only a minimal **Pesan klarifikasi privat dikirim** audit event
  with actor, need, and UTC time; primary status alone grants no thread access.
- Messages are immutable and retained for the later manual deletion/retention
  workflow. There is no automated purge. `0022_outreach_clarifications.sql` adds the
  message table, request chronology index, and minimal audit trigger. No environment
  variables are added.

## Local setup and verification

Migration `0015_outreach.sql` adds requests, notification intents, closures, minimal
audits, current-eligibility views and cancellation/freeze/history triggers.
`0016_outreach_approval_continuity.sql` preserves historical directory approval
after coordinator departure while retaining current staff and sending-authority
checks. `0017_outreach_staff_recipients.sql` adds the current named introduction
recipient and replaces the approved-need view so historical staff validation
survives recipient replacement while current recipient authority is still checked.
`0018_outreach_introductions.sql` adds consent/sharing evidence, delivery state,
partial uniqueness indexes and eligibility/replacement/audit triggers.
`0019_atomic_introduction_capture.sql` adds the development-only introduction
mailbox. `0021_outreach_outcomes.sql` adds the outcome projection, append-only event
history, introduced-baseline/share trigger, conditional revision enforcement,
projection guards and minimal outcome audit actions. `0022_outreach_clarifications.sql`
adds private message retention and a minimal clarification audit trigger. There are
no new environment variables. Use the existing local setup and captured-mail adapter:

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
node scripts/test.mjs tests/outcomes.test.mjs tests/browser/outcomes.spec.ts
node scripts/test.mjs tests/clarification.test.mjs tests/browser/clarification.spec.ts
npm run typecheck
npm run build
```

The full integration runner includes these journeys. Time/queue setup writes in the
focused tests are guarded to the runner's disposable D1 state; all behavior is
asserted through HTTP, captured mail or rendered pages. Ordinary localhost state
is separate. The handoff records actual verification results and commit boundaries.
