# Readable activity logs and history tables

Date: 2026-10-25. Status: specified for implementation.
Testing seam confirmed by the user: existing real local Worker/D1/Better Auth HTTP and Chromium journeys.

## Problem Statement

Activity histories expose internal account IDs and present repeated events as cards, paragraphs, or lists. Administrators, reviewers, coordinators, and members cannot easily recognize who acted or compare actions over time. People should be identified by name and email, and activity records should be readable in tables.

## Solution

Convert the inventoried activity/history collections to accessible, responsive tables. Replace visible actor account IDs with an authorized identity projection containing the saved account name and email. Preserve each history's audience, event details, timestamps, pagination, and workflow controls.

### Inventory and acceptance matrix

This is a source-code inventory of the current checkout, not a claim of live browser verification. Each row is an implementation acceptance surface.

| Surface                                                                     | Current presentation                                       | Required result                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| /admin/audit                                                                | Ordered cards; actor IDs and target ID or invitation email | Table of time, action/role, actor name/email, target identity, and existing restricted details                                      |
| /admin/outreach-audit                                                       | Ordered cards; actor IDs or Sistem, need IDs               | Table of time, action, actor name/email, and existing need context                                                                  |
| /directory/tags                                                             | Paragraph events with actor IDs                            | Expertise-change table with time, action, actor name/email and tag details                                                          |
| /admin/membership/:userId — suspension review requests                      | Articles with explanation, time and resolution status      | Review-request table retaining existing details and resolution status; resolve any displayed resolver as name/email                 |
| /admin/membership/:userId — status decisions                                | Articles with reviewer IDs                                 | Status-change table with reviewer name/email, outcome, time and restricted reasons/messages                                         |
| /admin/membership/:userId — house corrections                               | Articles with reviewer IDs                                 | Correction table retaining revision, old/new house, evidence and reason, with reviewer name/email                                   |
| /admin/membership/:userId — references                                      | Articles with invited email and responding account ID      | Reference table distinguishing invited email from actual responder name/email; unanswered requests have no invented actor           |
| /admin/membership/:userId — decisions                                       | Articles with reviewer IDs                                 | Decision table preserving revision, result, evidence, private reason and applicant message                                          |
| /admin/membership/:userId — application versions                            | Full revision articles                                     | Version-summary table with expandable or linked existing full revision detail                                                       |
| /membership — application history                                           | Full revision articles                                     | Member-visible version-summary table retaining existing full details and redaction                                                  |
| /school-needs/:needId — versions and approvals                              | Paragraphs; actor IDs only in reviewer projection          | Version and approval tables with version/stage/time and reviewer-visible actor name/email                                           |
| /admin/profile-deletions/:requestId — action history                        | Ordered action cards with actor IDs                        | Action table preserving time, action, counts and completion evidence, with operator name/email                                      |
| /outreach/needs/:needId and /outreach/requests/:requestId — outcome history | Shared expandable ordered cards with actor IDs             | Shared outcome-history table retaining revision, action, actor kind, previous/new state, note and time; actor name/email            |
| Same outreach detail surfaces — introduction sharing history                | Repeated sent-introduction paragraphs                      | Sharing-history table with existing authorized staff identity, state and sharing time; preserve captured identity and consent rules |

Adjacent cleanup: in the coordinator's per-recipient outreach panels, replace visible recipient and coordinator account IDs with name/email using the same restricted identity projection. These panels contain operational forms and need not become a single large table.

The private clarification conversation remains a conversation with its existing role attribution. Current account lists, invitation/email-change forms, deletion instructions, profile summaries, school attendance history, and workflow queues are not activity logs and are outside this table conversion.

## User Stories

1. As a primary administrator, I want audit actors shown by name and email, so that I can recognize who changed access.
2. As a primary administrator, I want audit targets identified clearly, so that I can distinguish the actor from the affected account or invitee.
3. As a primary administrator, I want outreach audit events in a table, so that I can compare actions and times.
4. As a directory coordinator, I want expertise changes attributed to named accounts, so that I can understand taxonomy maintenance.
5. As a membership administrator, I want named decision makers, so that I can trace membership decisions.
6. As a membership administrator, I want status changes in a table, so that I can review suspension and reinstatement history.
7. As a membership administrator, I want house corrections with evidence and named reviewers, so that I can assess prior checks.
8. As a membership administrator, I want invited reference email distinguished from the responding account, so that I can interpret unanswered and answered requests correctly.
9. As a membership administrator, I want application versions summarized in rows, so that I can compare revisions while opening full details.
10. As an applicant, I want my application history in a table, so that I can follow revisions without gaining access to private reviewer information.
11. As an authorized school-need reviewer, I want named revision authors and approvers, so that I can understand approval responsibility.
12. As a school submitter, I want version and approval progress in a table, so that I can follow review without receiving restricted identities.
13. As a deletion operator, I want named action authors and completion evidence, so that I can trace removal and retention work.
14. As a coordinator, I want named outcome authors with their role, so that I can distinguish coordinator updates from member confirmations.
15. As a recipient, I want my permitted outcome history in a table, so that I can understand and correct the recorded result.
16. As a coordinator, I want readable recipient and assignment identities, so that I can identify the relevant people without interpreting IDs.
17. As an introduction participant, I want sharing history to preserve the identity actually used for sharing, so that later account edits do not rewrite what was disclosed.
18. As an authorized viewer, I want system and missing-account events explained, so that absent account data does not hide events or expose IDs.
19. As a viewer on a small screen, I want tables that scroll within their container, so that long emails and notes do not break the page.
20. As a keyboard or screen-reader user, I want labelled tables and proper headers, so that I can understand each row.
21. As a viewer, I want existing local-time displays and pagination preserved, so that I can continue navigating history accurately.
22. As a member, I want restricted messages and unrelated identities kept private, so that clearer attribution does not expose my other activity.

## Implementation Decisions

- Reuse the existing route loaders, application services, repositories and history components. Identity lookup belongs server-side after current authorization and record-scope checks. Fetch identities in a bounded batch or joins for the selected history page; avoid per-row requests and a client-accessible general identity lookup.
- Add a consistent account-identity projection and rendering convention across the listed histories. Use the saved account name and account email, not arbitrary event text or directory profile content. Show name and email in the actor cell, with wrapping and clear labels.
- Explicit policy change: authorized viewers of existing actor-bearing history projections may receive the corresponding actor name and current account email. This supersedes older ID-only/email-free read-projection requirements only for these listed activity views. Update the affected privacy documentation and tests during implementation.
- Actor-hidden projections remain actor-hidden: school submitter aggregates, member application history, and private clarification messages do not acquire identities. Primary audit permission does not grant directory search, private profile content, or private conversation access.
- The new exception concerns event actors and the existing primary-only audit target/coordinator recipient context. It does not expose every outreach recipient, change consent to share a member email with school staff, or add email to notification text or stored general audit events.
- Resolve names/emails as current account identity at read time and describe this in help text. Account corrections therefore update displayed attribution without rewriting immutable events. Preserve existing old/new name and email change evidence and captured introduction recipient/member identity.
- Use existing authoritative account identity; missing/blank name shows “Nama belum tersedia” alongside the permitted email. Missing account shows “Akun tidak tersedia” and unavailable email shows “Email tidak tersedia”. Do not derive names from email or ID. Explicitly system-originated events show “Sistem” with no invented email; unresolved human events must not be misclassified as system events.
- Resolve audit target account IDs as name/email; invitation targets remain the invitation email when there is no account. Preserve bootstrap operator evidence separately; never treat free-text operator fields as account IDs.
- Internal IDs remain stable storage keys, cursor tie breakers, links and form values; remove them from visible person labels and person tooltips. This is not a ban on technical IDs used internally or a requirement to remove unrelated record identifiers.
- Preserve all event rows and existing chronological order, stable pagination, same-time event handling, disclosure rules and private no-store responses. Missing identity joins must not drop events.
- Use semantic tables with captions or accessible names, column headers, empty states, readable long text and contained horizontal scrolling. Separate wide private evidence into accessible row details where necessary; do not truncate away required information.
- Preserve existing Bahasa Indonesia action labels and LocalTimestamp behavior. Keep forms, workflow checks, append-only event semantics, current role checks and mutation protections intact.
- No new event store, identity snapshots, backfill, search service or schema migration is expected. Keep event writes free of duplicated account emails.

## Testing Decisions

- Use the user-confirmed existing real local Worker/D1/Better Auth HTTP and Chromium seam with synthetic accounts and captured mail where existing fixtures need it.
- Extend existing roles, invitations, representative-names, email-changes, directory, membership, references, suspensions, corrections, school-needs, deletion, outreach, introductions and outcomes journeys. Test externally observable responses and rendered behavior rather than helper implementation or snapshots mirroring markup.
- Cover every inventory row with an authorized nonempty history and an empty state where reachable. Assert semantic tables, the relevant name/email pair, absence of visible account IDs, retained event details and working workflow controls.
- Cover blank names, missing/deleted account lookup, null system actor, unanswered reference, invited email versus responding account, duplicate names with distinct emails, and name/email updates. Verify old audit and captured-sharing evidence remains unchanged.
- Exercise guest, unrelated account, school submitter, recipient, coordinator, membership administrator and primary administrator page/API/React Router data access. Include existing-session role revocation and assert disallowed identities, private notes, messages and unrelated recipients are absent from response payloads, not merely hidden in the DOM.
- Verify consent is still required for member-email sharing to staff. Specifically assert the actor-display exception does not leak recipient email through school aggregate views or clarification messages.
- Verify existing cursors and ordering with same-time events and unresolved actors; identity enrichment must neither multiply nor remove rows.
- Chromium checks cover narrow and desktop widths, long emails/notes, keyboard details access, table headers and browser-local timestamps.
- Run focused journeys, then required repository checks and full suite for implementation; record actual evidence in the handoff. This specification task does not claim those tests have run.

## Out of Scope

New global activity feed; new permissions or roles; private conversation conversion; general account editing; new filtering, sorting, export or pagination features; rewriting event history; historical name/email snapshots; automated retention; deployment; live email; unrelated forms and queue redesign.

## Further Notes

- Existing glossary and ADR directories were absent in the inspected checkout; use established account, primary administrator, membership administrator, directory coordinator, school need, reference, and introduction terminology.
- Issue searches found related work on timestamps (#31), representative names (#25), and existing workflow histories, with no matching activity-table improvement issue. Preserve those behaviors; these are context, not new sequencing blockers.
- The implementation issue should be flat and carry ready-for-agent. The local specification may be uncommitted/unpushed; include the full scope in the issue so it remains actionable remotely.
