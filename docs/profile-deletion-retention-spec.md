# Profile deletion and manual retention — issue #20

Draft technical specification, 2026-10-24. Source:
[issue #20](https://github.com/akbarsahata/alumni-platform/issues/20) (open,
`ready-for-agent`, no comments when read). Depends on
[#18](https://github.com/akbarsahata/alumni-platform/issues/18) and
[#19](https://github.com/akbarsahata/alumni-platform/issues/19), both implemented
locally. This expands the accepted
[profiles, expertise, and outreach scope](profiles-expertise-outreach-spec.md).
Implementation details below are proposals for review, not evidence of delivery.
The accepted product specification remains authoritative if a conflict is found.

The issue is already a flat implementation issue. This document is local and does
not create a parent specification issue or change tracker state.

## Verified checkout baseline

- The `expertise_profile` row already has `deletion_requested_at`. The directory
  search, profile eligibility check, outreach eligibility view, and pending-request
  cancellation triggers already treat that flag as an immediate exclusion. No
  product route currently sets it.
- `outreach_cancel_profile` cancels pending outreach requests and their pending or
  claimed request/reminder notifications when a profile update makes the member
  ineligible. `outreach_introduction_cancel_profile` invalidates pending and
  claimed introductions that have not been shared. Interested/declined responses,
  outcomes, and shared evidence remain historical.
- Profile save and confirmation currently do not check the deletion flag. They must
  stop accepting changes while a deletion request is active.
- Existing pages are `/profile`, `/outreach/requests/:requestId`,
  `/admin/audit`, and `/admin/outreach-audit`. No deletion-request or deletion-
  processing page or API exists.
- Outcome history has append-only delete guards. Ordinary retention therefore
  needs a separately authorized manual deletion path; this was anticipated by the
  #19 technical specification.
- Migrations currently run through `0023_school_need_location_scope.sql`. Recheck
  numbering, branch state, and prerequisite delivery before implementation.
- The accepted verification seam is the real local Worker, disposable D1, Better
  Auth, captured mail, and Chromium. Deletion and retention tests belong in the
  existing outreach context because they need outreach fixtures and cancellation
  behavior.

## Problem Statement

A member who wants their directory profile removed has no product path for making
that request. The organization therefore cannot guarantee that the profile stops
appearing in discovery and outreach immediately, cannot reliably cancel pending
outreach and introductions, and cannot show the member what will happen to their
account, membership, shared email, and private clarification text.

The primary administrator also has no restricted processing surface for completing
the manual removal within 30 days. Profile content and private clarification text
could remain indefinitely, while ordinary retention periods have no concrete
procedure, no audit evidence, and no way to remove append-only outcome history
without weakening normal operation.

## Solution

Add a member-initiated directory-profile deletion request. Submitting it hides the
profile immediately, cancels unanswered outreach and pending introductions, leaves
the account and membership intact, and opens a restricted primary-administrator
processing queue. The member sees a Bahasa Indonesia status page explaining the
30-day manual process, the separate account/membership/financial policies, and the
fact that already shared email cannot be recalled.

The primary administrator works from a dedicated deletion screen that can remove
profile content and private clarification text, records every action and the
completion evidence, and shows the 30-day due date. That screen grants no directory
search or profile browsing authority. Ordinary 90-day clarification retention and
12-month need-level retention remain documented manual procedures using restricted
SQL and a recorded retention execution; no scheduler, automatic purge, or
background deletion is introduced. Aggregate school-need metrics are preserved in
an aggregate-only snapshot before individual records are removed.

## User Stories

1. As an approved alumnus, I want to request deletion of my directory profile, so that I can leave discovery without deleting my account or membership.
2. As an alumnus, I want my profile hidden immediately after I request deletion, so that manual processing does not keep me discoverable.
3. As an alumnus, I want to see the status and 30-day due date of my request, so that I know when the organization should complete removal.
4. As an alumnus, I want to be told that my account, membership, and financial records are not deleted, so that I understand the separate policies.
5. As an alumnus, I want to be told that already shared email cannot be recalled, so that I can make an informed decision before requesting deletion.
6. As an alumnus, I want to be told that unanswered outreach, reminders, and pending introductions are cancelled, so that I understand the immediate effect.
7. As an alumnus, I want interested or declined responses and shared evidence to remain historical, so that past participation is not rewritten.
8. As an alumnus, I want repeated submissions to be harmless, so that a retry or double click does not create duplicate work.
9. As an alumnus, I want the request to be final once submitted, so that I know the organization will not silently restore my profile while processing it.
10. As an alumnus, I want profile editing and reconfirmation blocked while deletion is active, so that the content being removed cannot change underneath the operator.
11. As an alumnus, I want to see which manual removal steps are complete, so that I can follow progress without contacting an operator.
12. As an alumnus, I want my private clarification text removed during processing, so that private messages do not outlive my profile.
13. As an alumnus, I want my request history and outcome evidence handled by the documented retention rules, so that removal is predictable.
14. As an alumnus, I want a clear completion status, so that I know when profile content and private clarification text are gone.
15. As an alumnus, I want the option to create a new profile later if I choose, so that deletion is not an irreversible account decision.
16. As the primary administrator, I want a queue of deletion requests, so that I can process them within 30 days.
17. As the primary administrator, I want each request to show its due date and overdue state, so that I can prioritize manual work.
18. As the primary administrator, I want to remove profile content through a dedicated action, so that I do not need broad database access.
19. As the primary administrator, I want to remove the member's private clarification text through a dedicated action, so that the removal is scoped to the right requests.
20. As the primary administrator, I want to see how many rows each action removed, so that completion has concrete evidence.
21. As the primary administrator, I want to record a completion note, so that the organization has evidence of what was verified.
22. As the primary administrator, I want completion blocked until both removal steps are marked done, so that a request cannot be closed prematurely.
23. As the primary administrator, I want repeated or concurrent processing actions to create at most one event, so that the history does not diverge.
24. As the primary administrator, I want deletion access without implicit directory access, so that processing a deletion does not become profile browsing.
25. As the primary administrator, I want an audit trail of actor, action, due date, and completion evidence, so that the manual workflow is accountable.
26. As a directory coordinator, I want deletion-requested members excluded from discovery and outreach, so that I cannot send them new requests.
27. As a directory coordinator, I want pending requests and introductions to be cancelled immediately, so that a deletion request is not undermined by in-flight outreach.
28. As a directory coordinator, I want shared introductions and outcomes retained as restricted evidence, so that historical accountability is preserved.
29. As a directory coordinator, I want clarification threads to become read-only and later empty after processing, so that I cannot keep using a deleted member's private thread.
30. As a school staff representative or student representative, I want deletion processing to expose no alumni contact details or profile content, so that the school workflow remains aggregate-only.
31. As a member, I want other members' profiles and clarification threads to remain unaffected, so that one deletion cannot damage unrelated records.
32. As an operator, I want clarification text removed 90 days after a request ends, so that private exchanges do not remain indefinitely.
33. As an operator, I want request, consent, sharing, and outcome records removed after 12 months from need closure, so that ordinary retention is bounded.
34. As an operator, I want aggregate school-need metrics preserved before individual records are deleted, so that reports remain useful without retaining personal data.
35. As an operator, I want the 12-month profile-deletion evidence hold enforced, so that consent and sharing evidence is not deleted too early.
36. As an operator, I want a documented, restricted execution record for every manual retention run, so that elapsed time alone never removes data.
37. As an operator, I want the retention procedure to work against real persisted records, so that the runbook is not merely aspirational.
38. As a developer, I want origin protection, authentication, field-level projections, and no-store responses on deletion reads and writes, so that the private workflow follows the existing security boundary.
39. As a developer, I want deletion and retention behavior verified through the real local Worker, D1, email capture, and Chromium, so that the evidence matches production-shaped behavior.
40. As a developer, I want the migration and operator procedure documented in the handoff, so that local and future manual operation are reproducible.

## Implementation Decisions

### Domain boundary and authority

- Directory-profile deletion is distinct from account deletion, membership
  suspension, role revocation, and financial-record deletion. A deletion request
  never changes membership status, account email, role assignments, or financial
  records.
- Only the member who owns the profile can create a deletion request. Only the
  primary administrator can process it. A directory coordinator, membership
  administrator, staff representative, student representative, or another member
  cannot read or mutate the processing queue.
- Deletion processing authority is deliberate and narrow: it permits the dedicated
  deletion actions and their evidence, but grants no directory search, candidate
  list, profile detail, outreach workspace, or clarification-thread access. A
  primary administrator who also holds the directory-coordinator role gets
  directory access through that role, not through deletion authority.
- Server authorization is rechecked at every read and mutation. UI visibility is
  not an authorization boundary.

### Deletion request lifecycle

- A request is available when the member has a profile row. It does not require
  current participation or an approved (rather than suspended) membership because
  deletion should remain available while eligibility is already restricted.
- The first request records the request time, a due date 30 calendar days later in
  UTC, the requesting member, and an initial `requested` event. It immediately sets
  the profile's deletion marker.
- A partial unique constraint permits at most one active request per member.
  Repeated and concurrent submissions are idempotent: they return the existing
  active request, create no second request or event, and do not move the due date.
- There is no member cancellation or undo flow. A mistaken request follows the
  documented processing path; the member can create a new profile after completion
  rather than reviving the cancelled outreach.
- Profile save and confirmation are rejected while an active request exists, even
  if the profile row has already been removed. A new profile can be created only
  after the request is completed; a later deletion request then starts a new
  lifecycle.
- A completed deletion is permanent for that profile row. The member is not
  automatically opted back in, and cancelled outreach requests never revive.

### Immediate hiding and cancellation

- Setting the deletion marker removes the profile from directory search and from
  the outreach eligibility view in the same database change.
- The existing eligibility triggers cancel every pending outreach request and its
  pending or claimed request/reminder notification. They also invalidate every
  pending or claimed introduction that has not been shared.
- Interested and declined responses remain historical. A shared introduction is
  never recalled. An outcome and its history remain until ordinary retention.
- An interested request without consent cannot gain new consent after the deletion
  marker is set. Its page remains historical and read-only for sharing.
- The deletion processing screen must not rely on a later job to perform any of
  these cancellations.

### Manual processing and evidence

- The primary queue lists active requests by due date and completed requests by
  completion time. It marks overdue active requests without changing their state
  automatically.
- The processing detail shows the account ID, school-time membership name, house,
  request and due times, step completion, removal counts, and event history. It
  does not show account email, professional introduction, locations, expertise
  tags, availability notes, clarification text, need details, or outcome notes.
- Two explicit actions are available:
  - **Hapus konten profil** deletes the profile row, removing all profile fields,
    tag selections, location selections, availability data, and the deletion
    marker. It records the actor, time, and the number of profile rows removed
    (zero or one).
  - **Hapus teks klarifikasi privat** deletes all clarification messages attached
    to requests where the member is the recipient. It does not delete messages the
    member authored as a coordinator in another member's thread. It records the
    actor, time, and the number of messages removed.
- Both actions are manual, explicit, origin-protected, and idempotent only in the
  sense that a repeated action returns a conflict without a duplicate event. They
  do not delete requests, introductions, outcomes, audits, account records, or
  membership records.
- **Selesaikan penghapusan** requires both removal steps and a trimmed completion
  note of 1–1,000 characters. It updates the request to completed, records the
  completing actor and time, and appends one `completed` event. Completion before
  both steps, repeated completion, or a stale/concurrent action returns a conflict
  with no extra event.
- The request and event history are the completion evidence. The due date is
  recorded, not recalculated from the completion time. Late completion is allowed
  but remains visibly late in the history.

### Retention and operator procedure

- Ordinary clarification text is eligible for manual removal 90 days after the
  request ends. A request ends at the earliest applicable point: a declined or
  cancelled response, expiry, or need closure. Messages on still-open requests are
  not eligible.
- Request, consent, sharing, and outcome records are eligible for manual removal
  12 months after the need closes. This slice uses deletion plus an aggregate
  snapshot rather than in-place anonymization: individual records are deleted, and
  aggregate school-need metrics are preserved in an aggregate-only snapshot before
  deletion. The snapshot contains counts, not member IDs, names, emails, notes,
  request IDs, or timestamps of individuals.
- Consent and sharing evidence for a deleted profile is held for 12 months after
  deletion completion. Ordinary cleanup must skip or defer those introduction rows
  and the parent request/need rows needed to retain them.
- A read-only retention view exposes clarification candidates, a second view
  exposes closed needs past 12 months, and a third exposes active profile-deletion
  evidence holds. These views identify candidates; they do not delete anything.
- Manual deletion is authorized by a recorded retention execution with the acting
  primary administrator, scope, target, reason/evidence, and timestamps. Retained
  outreach records cannot be deleted through normal application code or by elapsed
  time alone. The database rules reject deletion before the applicable period, for
  an active profile-deletion hold, or without a matching execution record. The
  profile deletion processing path is the one exception for clarification text:
  an active deletion request authorizes removal of that member's own thread.
- Deletion-request and deletion-event evidence is retained for 12 months after
  completion, then removed by the same documented manual retention procedure.
- The documented runbook covers backup/export, candidate review, aggregate snapshot
  creation, execution evidence, deletion order, verification queries, and the
  final confirmation that general audits contain no email, profile content, or
  messages. It uses the local D1 operator boundary; no remote or scheduled run is
  part of this slice.

### Persistence and migration

- Add the next sequential migration after `0023` with:
  - A deletion-request table containing the member, requested and due times,
    status, step actors/times, clarification removal count, completion actor/time,
    and completion evidence.
  - An append-only deletion-event table containing request, actor, action, optional
    evidence/count, and UTC time.
  - A partial unique index for one active request per member.
  - A retention-execution table for manual ordinary-retention evidence.
  - An aggregate-only school-need retention snapshot.
  - A read-only candidate/hold view set for the runbook.
  - Database triggers that set the profile deletion marker and create the initial
    event atomically, validate step authority/order, delete the profile row and
    scoped clarification text atomically with their events, and derive the request
    projection from the event history.
  - Delete guards for retained outcome, introduction, request, and clarification
    data, with the documented retention-execution exception and the active
    profile-deletion exception for the member's own clarification thread.
- No backfill of historical deletion requests is required. The new request path is
  the only product path that sets the marker.
- No new bindings, secrets, environment variables, provider configuration, or
  scheduled Worker jobs are required.

### HTTP, page, and data-route contracts

| Surface                                                              | Behavior                                                                                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/profile/deletion`                                          | Member's own request/status, profile existence, timestamps, step state, and removal count; no operator evidence note.            |
| `POST /api/profile/deletion`                                         | Strict `{ confirm: true }`; creates or returns the active request; 409 when no profile exists; idempotent on repeat/concurrency. |
| `/profile/deletion`                                                  | Bahasa Indonesia request/status screen with loader and form action.                                                              |
| `GET /api/admin/profile-deletions`                                   | Primary queue of active and recent completed requests with due/completion times and safe membership identity.                    |
| `GET /api/admin/profile-deletions/:requestId`                        | Primary detail with steps, counts, event history, and completion evidence; no profile or clarification content.                  |
| `POST /api/admin/profile-deletions/:requestId/profile-removal`       | Primary-only manual profile deletion.                                                                                            |
| `POST /api/admin/profile-deletions/:requestId/clarification-removal` | Primary-only scoped clarification deletion.                                                                                      |
| `POST /api/admin/profile-deletions/:requestId/complete`              | Primary-only completion with required evidence and both steps.                                                                   |
| `/admin/profile-deletions`                                           | Primary queue page.                                                                                                              |
| `/admin/profile-deletions/:requestId`                                | Primary processing page and form actions.                                                                                        |

- Guest requests return 401. Non-primary access to the administrator surfaces
  returns 403. Missing or inaccessible individual requests return 404 where the
  route is already scoped to the actor; the primary owner of the queue sees the
  queue.
- Invalid payloads return 400, lifecycle conflicts and stale/concurrent actions
  return 409, and unsupported methods return 405. All private reads and mutations
  are no-store. Mutations retain trusted-origin protection.
- React Router `.data` responses use the same authorization and projections as the
  HTML pages and APIs.
- The member page uses the existing profile feedback conventions. The processing
  page uses explicit destructive-action confirmations and a visible due date.

### Interface copy and navigation

- Add a **Privasi & penghapusan** entry point from the profile page. While a
  request is active, the editing form is replaced by a status notice and a link to
  `/profile/deletion`; after completion, the notice remains and a new empty profile
  can be created if the member chooses.
- Member copy states that the profile is hidden immediately; pending outreach,
  reminders, and unsent introductions are cancelled; account, membership, and
  financial records are separate; shared email cannot be recalled; private
  clarification text is removed during processing; and the organization targets
  completion within 30 days.
- Add **Penghapusan profil** to the primary-only Administrasi menu and to the
  primary role-preview menu. No other role sees the destination. The deletion page
  contains no directory search link.
- Primary copy distinguishes the two removal steps, shows the due date and overdue
  state, explains what each action does and does not delete, requires completion
  evidence, and states that the screen grants no directory browsing.
- Use Bahasa Indonesia for product copy and keep technical identifiers, tables, and
  route names in English.

## Testing Decisions

The confirmed seam is the real local Worker, disposable D1, Better Auth,
captured-email boundary, supported HTTP routes, React Router data routes, and
Chromium with synthetic accounts. No new seam, repository mock, or authorization
substitute is introduced. This matches the existing profile, outreach, outcome,
and clarification integration suites.

A good test asserts externally observable behavior: supported routes, rendered
copy, status codes, persisted records observed through later authorized reads,
captured state only where the product exposes it, and audit output. It does not
mirror repository method names or assert private query structure.

- Add a focused deletion HTTP suite and a Chromium deletion journey. Assign both to
  the existing outreach context in the runner and CI context table. Keep the HTTP
  producer before the browser consumer and update the fail-closed assignment map.
- Cover immediate hiding: profile eligibility, directory search, directory detail,
  and outreach candidate eligibility all exclude the profile before processing.
  Pending requests, reminder/request notification intents, and pending/claimed
  introductions are cancelled; interested/declined responses, shared introductions,
  and outcomes remain.
- Cover repeated and concurrent requests: one request row and one requested event;
  both responses return the same active request; the due date is not reset.
- Cover profile save and confirmation rejection during an active request, including
  after the profile row has been removed. Cover a new profile and a new lifecycle
  after completion.
- Cover authorization and field privacy for the member, guest, another member,
  primary without directory authority, primary with directory authority, directory
  coordinator, membership administrator, staff, and student on APIs, HTML pages,
  and `.data` routes. Assert 401/403/404, no-store, and no email/profile/clarification
  leakage. Assert primary deletion access does not imply directory access.
- Cover origin protection, strict payload validation, 405 behavior, invalid IDs,
  and missing profile/step conflicts.
- Cover every manual processing action: profile removal, clarification removal,
  repeated/concurrent actions, completion before both steps, completion evidence
  bounds, completion, and duplicate completion. Assert actor, action, due date,
  timestamps, counts, and one event per action.
- Cover post-removal disclosure through profile, directory, outreach request, need,
  deletion-detail, general-audit, and React Router data routes. Assert profile text
  and clarification text are gone, while membership/account data and unrelated
  members' profiles/threads remain.
- Cover clarification deletion scope: only requests where the deleted member is the
  recipient lose messages; messages authored as a coordinator in another member's
  thread remain.
- Review and exercise the retention runbook against disposable persisted records:
  create request ends older than 90 days, closed needs older than 12 months, shared
  introductions, outcomes, and a completed profile-deletion evidence hold. Run the
  documented candidate queries, execution evidence, deletion order, snapshot
  creation, and verification queries. Assert premature deletion is rejected,
  profile-deletion holds defer introduction deletion, aggregates remain visible,
  and general audits retain no email, profile content, or messages.
- Use fixture time manipulation only for setup and operator boundary checks; assert
  product behavior through supported HTTP/HTML/Chromium reads and the documented
  operator SQL.
- Run the focused HTTP and browser journeys, the required full suite, typecheck,
  build, lint, and format checks. Record exact commands, results, screenshots,
  migration application, retention-review evidence, remaining risks, and the
  local/remote delivery boundary in the handoff.
- Keep ordinary localhost manual testing available. Automated verification uses
  isolated disposable state with synthetic accounts; it does not delete or migrate
  the normal local database.

## Out of Scope

- Entire-account deletion, membership deletion or suspension, role revocation,
  financial-record deletion, and changes to their retention policies.
- A member-cancel or undo flow for an active deletion request.
- Automated deletion, scheduled purge jobs, automatic anonymization, background
  retention workers, or claiming that elapsed time removes records.
- A full retention-administration UI, bulk deletion UI, legal-hold management, or
  backup/restore automation.
- Email notifications to the primary or member about deletion progress, and live
  email delivery.
- Deletion of messages the member authored as a coordinator in another member's
  thread, or deletion of another member's profile, requests, outcomes, or evidence.
- Contacting the member outside the platform, identity-document collection, or
  account recovery.
- Directory browsing, search, candidate lists, or clarification access through
  deletion authority.
- Deployment, remote migrations, production configuration, and live credentials.

## Further Notes

This is the final profiles/outreach implementation slice. #18 and #19 are complete
locally but remain subject to the current tracker state; recheck their issue bodies,
labels, comments, and dependencies before implementation. The local specification
does not imply that #20 is implemented or that it should be closed.

The user accepted dedicated primary processing screens for the two profile-deletion
removal steps, with the ordinary 90-day and 12-month retention steps remaining a
documented manual SQL procedure. This matches the issue's requirement for
restricted operator behavior without introducing scheduled deletion.

The member-facing deletion request is intentionally limited to directory-profile
deletion. The organization's separate account, membership, and financial policies
remain authoritative and are not changed here. Already shared email remains in the
recipient's mailbox and in restricted platform evidence; the product can only stop
future sharing.

The ordinary retention procedure is manual by design. The runbook must be concrete
enough for an operator to run against the local D1 database, and the implementation
must demonstrate it against real persisted records before claiming completion.
