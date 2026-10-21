# Outreach outcomes and school-need closure — issue #19

Draft technical specification, 2026-10-20. Source: [issue #19](https://github.com/akbarsahata/alumni-platform/issues/19)
(open, `ready-for-agent`, no comments when read). Depends on
[#17](https://github.com/akbarsahata/alumni-platform/issues/17). This expands the
accepted [profiles and outreach scope](profiles-expertise-outreach-spec.md);
implementation details below are proposals for review, not evidence of delivery.
The accepted product specification remains authoritative if a conflict is found.

## Purpose and scope

Track whether a consented introduction leads to confirmed help, completion, or
an arrangement that does not proceed. Directory coordinators record short notes;
members confirm or correct their own outcomes with attribution and history.
School submitters follow aggregate progress through and after need closure.

Keep response, consent, introduction delivery, outcome, and need closure as
separate facts. Expressing interest must never create an introduction or imply
help has been confirmed. Closing a need stops recruitment; it does not imply all
help is complete or revoke an already authorized introduction.

No deployment, live mail, new provider integration, scheduled jobs, automatic
retention/deletion, public reports, or entire-account deletion belongs to #19.
Private clarification remains #18; deletion/retention processing remains #20.

## Verified checkout baseline

- `app/outreach/model.ts` defines response states separately from introduction
  delivery states. Outcome states are not implemented there yet.
- `app/db/outreach.repository.server.ts` already provides `close`, `aggregate`,
  coordinator takeover, request access, and consent/sharing projections.
- `closeOutreachNeed` and `POST /api/outreach/needs/:needId/close` already exist.
  `outreach_closure` holds one closure per need; existing database triggers cancel
  unanswered requests and notification intents. Extend and verify this path.
- `aggregate` currently returns response counts and a closed flag. The authorized
  `/school-needs/:needId` projection renders these counts. Extend its existing
  access policy; do not grant all school accounts access to every need.
- Introduction evidence in `outreach_introduction` contains restricted email
  snapshots. Safe coordinator sharing projections omit email. Migration 0019
  atomically records local mail capture and `shared_at`; that committed sharing
  fact is the outcome baseline, not consent or an attempted delivery.
- Existing pages are `/outreach/needs/:needId`,
  `/outreach/requests/:requestId`, `/school-needs/:needId`, and
  `/admin/outreach-audit`. Reuse them and the accepted grouped navigation.
- Current migration files run through `0020_representative_names.sql`.
  Recheck numbering and prerequisite delivery before implementation; historical
  handoff branch/frontier statements are not proof of the current tracker state.

## Outcome model and proposed decisions

Use one outcome stream per outreach request, even if its introduction evidence
contains multiple consent attempts or staff replacements. A request contributes
at most once to each current-state aggregate. An outcome requires at least one
committed introduction with non-null `shared_at`.

| Technical state   | Bahasa Indonesia label | Meaning                                                           |
| ----------------- | ---------------------- | ----------------------------------------------------------------- |
| `introduced`      | Sudah diperkenalkan    | Email introduction was committed; no later outcome recorded       |
| `help-confirmed`  | Bantuan dikonfirmasi   | Help has been agreed                                              |
| `completed`       | Selesai                | Agreed help was delivered                                         |
| `did-not-proceed` | Tidak berlanjut        | The introduction did not lead to help, or the arrangement stopped |

Proposed pilot rule: coordinators and the recipient member can select any of
these states after introduction, including correcting a completed outcome or
skipping an unrecorded intermediate stage. A correction appends a new event;
it never changes the response, consent, or actual introduction evidence.
Returning to `introduced` means no later result is currently asserted; it does
not recall the shared email. No outcome is allowed on pending, declined,
cancelled, or interested-but-unshared requests.

Member confirmation appends a `confirm` event for the displayed current state.
A correction appends `correct`; coordinator recording appends `record`.
Show the latest actor/source alongside the current outcome. A confirmation
applies only to the revision confirmed; a later coordinator edit makes that old
confirmation historical. Members can correct again. Do not silently prioritize
coordinator reports over member reports or label a changed value member-confirmed.

Proposed text bounds: coordinator notes are required, trimmed, 1–500 characters;
member correction explanations use the same bound; confirmation needs no note.
Render text escaped. Notes must describe the arrangement, not contain contact
details, house information, or copied private clarification. These notes are
visible to the recipient member and current directory coordinators only.

Proposed authority rule: approved recipient members can confirm/correct their
historical outcomes even after opt-out, unavailability, staleness, expiry, or
closure; these actions do not resume discovery or sharing. Suspended membership
retains the existing read-only member boundary. Separately assigned coordinator
authority remains independent of membership suspension. Validate this policy
explicitly before implementation if the member history rules change.

## Persistence and atomic changes

Add a migration with matching Drizzle mappings. Suggested schema:

- `outreach_outcome`: `request_id` primary/foreign key, `revision` integer,
  `state`, `introduced_at`, `updated_at`. Revision zero is the derived introduced
  baseline; later revisions identify appended human events.
- `outreach_outcome_event`: stable `id`, `request_id`, `revision`, `kind`,
  `actor_user_id`, `actor_kind` (`member` or `coordinator`), `previous_state`,
  `state`, optional `note`, and database-generated UTC `occurred_at`.
  Unique `(request_id, revision)`; foreign keys, state/kind constraints, and
  indexes for request history and need-level outcome reads through requests.
- Preserve `outreach_closure` as the closure authority, including actor and UTC
  timestamp. Do not create a second closed flag that can diverge.

Initialize existing shared requests once at migration time using the earliest
`shared_at`. Install a trigger for the first newly committed sharing event to
create the introduced baseline atomically. Subsequent sharing records must not
reset an existing outcome, revision, or history. Never backfill consent-only rows
as introductions or invent human confirmations for historical data.

Use the repository's existing single-statement conditional-write/trigger pattern:
insert an event only if the request has shared evidence, the actor is currently
authorized, and the current revision equals `expectedRevision`. A trigger updates
the projection and creates the minimal audit event in the same atomic operation.
Reject direct projection edits through the application. Do not use a separate
read-then-update sequence or unsupported interactive D1 transactions.

Ownership, role, membership where applicable, request ID, and revision must be
rechecked inside the conditional write. If two edits race, one wins and one gets
409 with no event, projection change, or audit residue. A retried submission using
an old revision also gets 409; refresh before another intentional edit. Confirmation
advances the revision too. Preserve prior actor IDs after role revocation or
takeover; new coordinators act with their own identity.

## Workflow and HTTP contracts

Keep Hono and React Router adapters thin. Shared workflows authorize before
private reads, apply common Zod validation, and call operation-oriented repositories.
Suggested outcome workflows live in `app/outreach/outcomes.server.ts`; persistence
can use a dedicated `app/db/outcome.repository.server.ts` to keep the existing
outreach repository from accumulating unrelated SQL. Reuse shared access helpers.

| Surface                                          | Proposed behavior                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Existing request GET/page loader                 | Add safe current outcome, revision, relevant history and server-derived action permissions              |
| Existing coordinator need GET/page loader        | Add each request's current outcome and history access                                                   |
| `POST /api/outreach/requests/:requestId/outcome` | Coordinator `record`, or owner `confirm`/`correct`; input `{ action, expectedRevision, state?, note? }` |
| Request page action                              | Submit the same schema/workflow; never accept actor, member, need, or timestamp from the form           |
| Existing school-need GET/page loader             | Add aggregate outcomes and closure metadata only                                                        |
| Existing close POST/page action                  | Preserve one-time closure and existing cancellation semantics                                           |

For `confirm`, derive the state from the revision being confirmed; reject supplied
replacement state. For `record`/`correct`, require a valid state and note. Derive
actor kind from the authorized action, including accounts with both roles. A member
action must always be scoped to their own request. Strictly validate payloads,
nonnegative integer revisions and action-specific fields.

Use 401 for guests, the existing role-denial policy for missing permissions, 404
for inaccessible/missing individual records, 400 for malformed/invalid inputs,
and 409 for stale revisions or incompatible lifecycle state after authorized access.
Return only safe result data and the new revision. On 409, revalidate the loader,
explain the conflict in Bahasa Indonesia and require review before resubmission.
All mutations retain trusted-origin protection. Private successful and denied
API/page/React Router data responses use `Cache-Control: no-store`; unsupported
methods follow current 405 policy. Client controls never replace server checks.

## Closure, replacement, and races

Reuse coordinator closure for open needs, including approved needs with no sends.
One closure insert must atomically cancel still-unanswered requests and pending or
claimed request/reminder notifications. Keep declined/interested responses,
introduction evidence, outcomes and history. Existing elapsed expiry must remain
effective; closure must not extend response deadlines. Repeated or racing closure
returns the existing controlled conflict and writes no duplicate audit.

At conditional writes, closure must defeat new sends, responses, reminders and new
consent according to their existing lifecycle rules. A consent authorized before
closure may finish sharing afterward if current eligibility and consent still hold.
Outcome updates remain allowed after closure and request expiry. Test closure
against send, response, reminder, and introduction capture in both commit orders.
No reopening or reuse of a closed need is proposed.

Material changes require a new need through the existing creation and independent
approval workflow. Do not mutate frozen purpose, commitment, timing, payment or
location; copy no approvals, responses, consent or outcomes into the replacement.
The original history remains accessible to its authorized viewers. A replacement
uses a new need ID while retaining the global three-in-30-day member contact cap;
old cancelled/expired requests still count. Per-need ten-recipient and uniqueness
limits remain in force. No dedicated cloning UI is required for this slice.

## Projections, aggregate meaning, and audit

| Viewer                                                                    | Outcome visibility and mutation                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Current directory coordinator                                             | Individual outcome/history/notes; record outcomes and close needs            |
| Recipient member                                                          | Own outcome/history/notes; confirm or correct subject to member policy above |
| Authorized staff/student submitter or existing authorized school reviewer | Need-level totals and closure only; no individual outcome endpoint           |
| Primary administrator alone                                               | Existing minimal outreach audit; no individual outcomes or directory access  |
| Other accounts                                                            | No access unless separately authorized through the rows above                |

Extend aggregates with mutually exclusive current-state counts: `introduced`,
`helpConfirmed`, `completed`, `didNotProceed`. Their sum equals the number of
distinct requests with shared evidence. Existing response counts remain separate
and must not be added to outcome counts. A completed member is counted in
`completed`, not also `introduced`; use an explicitly named `introducedTotal` for
all introductions if needed. Corrections move one request between current buckets.
Confirmations change history but not totals. Multiple consent/sharing rows must
not multiply counts. Use a consistent database snapshot for totals and buckets.

School projections must contain no recipient/request IDs, names, individual
timestamps, notes, confirmation authors, emails, profiles, decline reasons or
clarification. Counts may be small in this bounded pilot; retain the accepted
aggregate-only policy without adding drill-down links. Named staff receive member
identity/email through consented introductions only; outcome screens add no contact
disclosure. Combined-role viewers get individual access only through explicit
coordinator authority or ownership, never through the school aggregate object.

General audit actions should distinguish `outcome-recorded`, `outcome-confirmed`,
and `outcome-corrected`; reuse the existing closure event. Project only event ID,
actor ID, need ID, action and UTC time. Keep values and notes in restricted outcome
history, not the primary/general audit, logs, error messages, or email payloads.
No new outcome/closure email is required; existing captured notifications and
introductions must retain their recipient/content safeguards.

## Bahasa Indonesia interface

Add **Hasil bantuan** to the existing coordinator need and recipient request
pages. Show state, author/source, UTC timestamp, latest note, and an expandable
history. Members get **Konfirmasi hasil** and **Koreksi hasil**; coordinators get
**Catat hasil**. Explain that confirming an outcome does not grant email consent.
Hide editing before introduction and show the actual sharing status separately.

Keep **Tutup kebutuhan** on the need workspace with a clear confirmation explaining
that unanswered requests stop while existing arrangements can continue. Show
**Kebutuhan ditutup**, closure time and aggregate outcomes on authorized school
pages. Closed needs retain outcome controls for authorized historical follow-up.
Preserve existing menu destinations; no new dashboard or breadcrumbs are needed.

Use existing pending controls, inline validation and toast conventions. Keep failed
input available for correction. Forms, labels, focus and conflict messages must be
keyboard-accessible and usable at desktop and 390px mobile width without overflow.

## Acceptance and verification plan

Use real isolated local Worker/D1/Better Auth/captured mail with synthetic accounts,
supported HTTP routes and Chromium. Disposable database setup may establish old
timestamps or race fixtures; behavior assertions must pass through supported routes.

1. Introduce a member through #17; verify exactly one introduced baseline. Pending,
   withdrawn, failed and consent-only delivery must not create an outcome. Backfill
   existing shared records without duplicate initialization or false human history.
2. Coordinator records confirmed/completed/not-proceeded outcomes with notes. Member
   confirms and corrects their own result. Verify prior values, source, timestamps,
   revision and note visibility; later edits invalidate current confirmation status.
3. Competing member/coordinator edits and duplicate submissions produce one committed
   revision. Forged owners/actors, cross-need IDs, invalid states, missing/overlong
   notes and stale revisions cannot change another record or create audit residue.
   Revoke coordinator authority between access and write and verify rejection.
4. Verify role/ownership and field privacy on API, HTML and React Router data routes,
   including primary-only, staff, student, unrelated member, revoked coordinator,
   suspended member and combined-role accounts. Check no-store and hostile/missing
   origin denial. Historical access must not reveal a newly ineligible profile.
5. Close a need with unanswered, interested, declined and introduced recipients.
   Verify cancellation of request/reminder intents, preserved responses/history,
   no new outreach, idempotent conflict, post-closure outcomes and authorized
   pre-closure consent delivery. Exercise race orders and expiry boundaries.
6. Replace a material need through fresh creation/approvals. Verify immutable original
   details, no inherited responses/consent/outcomes and unchanged rolling contact
   limits across original/replacement needs and multiple coordinators.
7. Check aggregate totals after corrections, confirmations, multiple consent attempts,
   takeover and closure. Assert no individual data in school JSON/HTML/data. Verify
   minimal primary audit and no implicit directory access. Inspect captured mail
   for cancelled reminders and duplicate/unauthorized introductions.
8. Chromium covers coordinator recording/closure, member confirmation/correction,
   school aggregates, history, stale-form conflict and desktop/mobile rendering.

Suggested new suites: `tests/outcomes.test.mjs` and
`tests/browser/outcomes.spec.ts`. Run those plus the existing outreach,
introductions and school-needs suites, then required full `npm test`, typecheck,
build, lint and formatting checks using the repository commands. Perform Standards
and Spec review as required for implementation. Document actual commands/results,
migration application, remaining risks and local/remote delivery boundaries in
`docs/handoff.md`; this plan is not a claim that those checks have run.

## Migration, operations, and retention handoff

Use the next available migration number. Apply first to disposable verification
D1, then ordinary local D1 while preserving existing data and localhost usability.
No new bindings, secrets or environment variables are proposed. No remote migration
or deployment is authorized by this document.

Closure timestamps anchor the existing manual 12-month request/consent/sharing/
outcome retention policy. Keep history logically append-only during normal
operation, while allowing the separately authorized #20 manual deletion/anonymization
procedure. Retention expiry does not automatically remove records. Private
clarification's 90-day rule and profile-deletion evidence restrictions remain
defined in the parent specification; #19 must not invent a new purge policy.

Completion of this specification does not implement #19 or change its issue state.
