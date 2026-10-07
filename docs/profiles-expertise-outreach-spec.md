# Profiles, expertise discovery, and school outreach

Scope settled on 2026-10-07 through the design interview. This local specification
supersedes the brief profiles/outreach section of the historical numbered roadmap.
Implementation issues will be flat, descriptively titled tasks referring to this
document. No parent specification issue or numbered subtickets are required.

## Problem Statement

The school needs alumni expertise for school activities and student mentoring,
but has no maintained alumni directory. Alumni need control over whether they can
be found, what opportunities they receive, and whether their email is shared.
School representatives need introductions without access to private alumni records.

## Solution

Approved alumni maintain private expertise profiles and explicitly opt into
school outreach. Designated directory coordinators discover eligible members and
send bounded, relevant requests against staff-validated needs. Members can express
interest, decline, or ask privately for clarification. An introduction shares email
only with a named, verified staff representative after separate explicit consent.
Coordinators track outcomes. Profile deletion and retention are handled manually
in the pilot; automated deletion and anonymization are outside this scope.

## User Stories

1. As an approved alumnus, I want to maintain my own professional profile, so that my expertise is represented accurately.
2. As an alumnus, I want to opt into discovery explicitly, so that membership approval alone does not invite outreach.
3. As an alumnus, I want to turn participation off, so that I disappear from searches and stop receiving new requests.
4. As an alumnus, I want to select several shared expertise tags, so that coordinators can find relevant skills.
5. As an alumnus, I want to describe expertise missing from the tag list, so that my contribution is not limited by the initial taxonomy.
6. As an alumnus, I want to choose ways I can help, so that requests reflect my willingness.
7. As an alumnus, I want to indicate available, limited availability, or temporarily unavailable, so that outreach respects my capacity.
8. As an alumnus, I want to provide an optional availability note, so that coordinators understand practical constraints.
9. As an alumnus, I want my verified school identity to come from membership records, so that profile editing cannot change eligibility facts.
10. As an alumnus, I want to confirm my profile and see its confirmation date, so that I can keep it current.
11. As an alumnus, I want stale profiles to stop attracting outreach, so that old information is not treated as current availability.
12. As a staff representative, I want to submit a school need, so that a coordinator can find relevant alumni.
13. As a student representative, I want to submit a need for staff validation, so that I can seek school support through an accountable process.
14. As a staff representative, I want to validate the purpose and commitments of a need, so that outreach accurately represents the school.
15. As a directory coordinator, I want to create a need and obtain staff validation, so that coordinator-created requests follow the same checks.
16. As a directory coordinator, I want to approve outreach separately from staff validation, so that recipient selection receives independent review.
17. As a directory coordinator, I want to search eligible profiles by expertise, introduction, location, help type, availability, and cohort, so that I can select relevant members.
18. As a former student, I want attendance years represented separately from graduation cohorts, so that discovery does not assign me a false graduation year.
19. As a directory coordinator, I want to choose individual recipients, so that each request has a relevance judgment.
20. As an alumnus, I want limits on repeated outreach, so that different coordinators cannot collectively overwhelm me.
21. As an alumnus, I want to see the purpose, help requested, commitment, timing, location, payment terms, and staff contact, so that I can make an informed decision.
22. As an alumnus, I want to express interest without releasing my email, so that willingness is separate from contact-sharing consent.
23. As an alumnus, I want to decline privately with an optional reason, so that I can refuse without reporting my decision to the school.
24. As an alumnus, I want to ask a coordinator for clarification privately, so that I can resolve uncertainty before accepting.
25. As an alumnus, I want separate consent naming the staff recipient and my email, so that I know exactly what will be shared and with whom.
26. As an alumnus, I want to withdraw consent before sharing, so that I retain control until the introduction occurs.
27. As a staff representative, I want a consented introduction, so that I can arrange the accepted help directly.
28. As a student representative, I want aggregate progress on my need, so that I can follow its progress without receiving alumni contact details.
29. As a directory coordinator, I want to inherit organization requests when another coordinator leaves, so that arrangements can continue responsibly.
30. As an alumnus, I want a replacement staff recipient to require fresh consent, so that an introduction cannot silently change its audience.
31. As a directory coordinator, I want to record introduction outcomes and close needs, so that operators can assess whether outreach helped.
32. As an alumnus, I want to confirm or correct my own outcome, so that a coordinator's note is not the only account of my participation.
33. As an alumnus, I want a directory-deletion request to hide my profile immediately, so that manual processing does not prolong discovery.
34. As the primary administrator, I want dedicated deletion handling and minimal outreach audits, so that I can operate the service without implicit directory search access.
35. As a directory coordinator, I want to add, rename, and retire expertise tags with history, so that the taxonomy evolves without losing members' selections.
36. As an operator, I want a documented manual retention procedure, so that private content is removed without automated purge jobs in this scope.

## Implementation Decisions

### Architecture and persistence

- Extend the existing Hono API and React Router page/action architecture. Shared
  workflow functions own authorization and Zod validation; operation-oriented
  Drizzle repositories own D1 persistence and conditional transitions.
- Add persisted profiles, expertise selections, availability and participation
  settings, profile confirmation, school needs and approvals, outreach requests,
  private clarification messages, consent/sharing events, outcomes, coordinator
  assignments, deletion requests, and minimal audit events. Exact schema and route
  names belong to implementation tasks.
- Persist workflow changes, audit evidence, and notification intent atomically
  through the existing D1-compatible patterns. Recheck authority and eligibility
  at conditional writes, not only at initial reads. Serialize competing sends and
  responses to enforce limits and prevent duplicate introductions.
- Reload current database-backed roles and membership on each request. Membership
  approval and privileged role assignment remain separate. Suspension removes
  eligibility as an outreach recipient; existing separately assigned coordinator
  permissions retain the current role policy until revoked.
- Profile saves and reconfirmation show a prominent dismissible success toast;
  one participation checkbox explicitly grants participation consent and explains
  the effect of ticking and unticking it. Editing an opted-in profile does not
  require a second consent checkbox. Confirmation sits in “Status relevansi profil”.
- Product copy is Bahasa Indonesia; technical identifiers are English. Use the
  existing email abstraction and synthetic local capture. No live delivery or
  production configuration is part of this work.

### Profiles and discovery

- Membership facts supply name while attending school, house, graduation year or
  attendance years. Profile editing cannot modify those facts.
- Optional profile fields: current/display name, professional introduction,
  general city/country locations, and availability note. Per the 2026-10-07 form
  refinement, locations use searchable multi-selects: cities are limited to
  Indonesia, with province labels; countries are worldwide. Persist canonical
  selections as escaped comma-separated identifiers, expose arrays to forms/API,
  and test the parsing/encoding helpers. Preserve existing free-text locations
  until the member replaces or removes them. Members select multiple
  expertise tags and ways they can help. Do not collect phone numbers, exact
  addresses, employer details, or profile photos as dedicated fields.
- Participation is off by default. Opt-in requires at least one expertise tag,
  one help type, an availability selection, and explicit participation consent.
  Only the member edits, confirms, or opts in their profile.
- Availability is available, limited availability, or temporarily unavailable.
  Temporarily unavailable members are excluded from outreach search and cannot
  receive new requests. Participation off also hides the profile and blocks new
  outreach; there is no discoverable-but-uncontactable pilot mode.
- Only approved, opted-in members with available or limited availability and a
  current confirmed profile appear in searches. Pending, rejected, suspended,
  stale, and deletion-requested profiles are excluded.
- Store and show the last explicit profile confirmation date. Substantive profile
  saves also confirm it. At 12 months without confirmation, exclude the profile
  from search and pause new outreach until the member reconfirms. Eligibility is
  enforced on access/send, without relying on a scheduled job.
- Search filters cover expertise, professional introduction, city/country, help
  type, availability, and graduation-year range. Former students use a separate
  attendance-year filter. House is not a discovery filter.
- Coordinators manage a shared taxonomy. Additions and label renames are audited;
  a meaning change requires a replacement tag selected by members. Retiring a tag
  preserves existing selections. Members can describe missing expertise in their
  professional introduction. Initial tag and help-type lists are implementation
  content, not permission boundaries.

### Needs and approvals

- Staff and student representatives can submit needs; coordinators can also create
  them. Every need requires a named staff representative's validation and a
  separate directory-coordinator outreach approval before sending.
- One actor cannot supply both approvals, even if holding both roles. Another
  authorized staff representative or coordinator provides the second approval.
- Require title, school purpose, requested expertise/help, expected time commitment,
  timing or deadline, remote/on-site location, named staff contact, and voluntary
  versus paid participation terms. An initiative link is optional; requests need
  not wait for an initiative to be published.
- Before sending, edits require both approvals again. Once sent, purpose,
  commitment, timing, payment terms, and location are immutable. Material changes
  require closing and replacing the need with fresh responses and consent.
- A changed staff recipient pauses introductions and requires fresh consent to
  that recipient. A recipient who loses the staff role cannot receive introductions.
- Closing a need cancels unanswered requests. Already accepted arrangements may
  continue after the response window; closing does not erase their history.

### Outreach and responses

- Coordinators choose individual recipients, with at most 10 recipients per need
  and one request per member per need. Each member can receive at most three new
  requests in a rolling 30-day period across all coordinators. Replacement needs
  do not bypass limits. Concurrent attempts must enforce the same bounds.
- Each request expires 14 days after sending or at the opportunity deadline,
  whichever comes first. A need with no deadline uses the 14-day bound.
- Members can express interest, decline, or ask for clarification. Decline reasons
  are optional and private to directory coordinators. Clarification is a private
  member/coordinator exchange on the request page, with email links back to it.
  Coordinators obtain staff input separately. Neither clarification nor delivery
  retries extend the response deadline.
- Permit at most one reminder after seven days, only while the request remains
  unanswered and eligible. A short deadline may leave no reminder window.
- Expiry blocks new responses and new sharing consent. Interest without consent
  expires without an introduction. Previously authorized introductions may finish
  delivery after expiry if eligibility and consent still hold.
- Requests are organization records. Active coordinators can take over with an
  audited assignment change. Revocation immediately blocks the former coordinator.

### Introduction and consent

- Interest and email-sharing consent are separate. The response page has an
  initially unchecked consent box naming the verified staff recipient and the
  member's email. A member may express interest and add consent later before expiry.
- Directory discovery and response status never expose account email. The service
  introduces the member directly to the named staff representative. Students never
  receive email or other contact details through this workflow.
- Recheck approved membership, participation, availability, consent, staff role,
  and cancellation state immediately before an introduction. Opt-out,
  unavailability, suspension, or deletion requests immediately cancel unanswered
  requests and queued reminders. Completed responses remain historical records.
- Members can withdraw consent until sharing occurs. Clearly explain that an email
  already shared cannot be recalled. Preserve minimal evidence of the recipient,
  consent, and sharing event; any introduced email retained for this purpose is
  restricted evidence, not a directory field or general audit payload.
- Send an introduction once and prevent repeated submissions, concurrent actions,
  and ordinary notification retries from producing duplicate sharing. General
  provider delivery handling and comprehensive outbox recovery remain later work.

### Outcomes and disclosure

- Track introduced, help confirmed, completed, and did not proceed. Coordinators
  record a short outcome note; members can confirm or correct their own outcome.
  Outcome corrections retain history rather than silently replacing it.
- Directory coordinators alone see candidate profiles, selected recipients,
  individual responses, and private clarification. Staff and students see their
  submitted needs, approval status, and aggregate progress without identities of
  members who declined or did not respond. Named staff receive member identity
  and email only through consented introductions.
- Members see their own profiles and requests. Primary administrators use dedicated
  minimal audit and deletion screens; primary status alone grants no search access.
  Other administrator, finance, alumni, and school roles do not imply directory
  access. Enforce these projections on APIs, pages, and React Router data responses.
- Audit significant approvals, outreach, assignment, taxonomy, consent/sharing,
  outcome, and deletion actions. General audit projections retain actor, action,
  and timestamp without profile content, clarification text, or email addresses.

### Manual deletion and retention

- Directory-profile deletion is distinct from account deletion. On request, hide
  the profile immediately and cancel pending outreach. The primary administrator
  processes removal within 30 days through a documented manual workflow.
- Remove profile content and private clarification text during deletion processing.
  Retain only necessary consent/sharing evidence for up to 12 months following
  profile deletion; keep existing account/membership records under their separate
  policies. A deletion request never implicitly deletes financial records.
- For ordinary records, manually remove clarification text 90 days after a request
  ends. Retain request, consent, sharing, and outcome records for 12 months after
  the need closes, then manually delete or anonymize them for aggregate metrics.
- Document manual processing, access restrictions, due dates, and completion
  evidence. Automated purge, deletion, and anonymization jobs are out of scope;
  do not claim that elapsed retention periods automatically remove records.

## Testing Decisions

The confirmed seam is the existing real local Worker, D1, Better Auth, and captured
email boundary, exercised through HTTP and Chromium using synthetic accounts.
This follows the current role, membership, reference, and suspension integration
tests. The user confirmed this seam during local specification synthesis.

- Test external behavior through supported routes and rendered pages, rather than
  mirroring repository methods or substituting authorization mocks.
- Exercise profile creation/editing/confirmation, opt-in requirements, all
  availability states, stale-profile exclusion, tag retirement, and both graduate
  and former-student filters. Check ownership and forged identity fields.
- Exercise staff/student need submission, independent approvals, pre-send edit
  invalidation, immutable sent details, replacement needs, and closure.
- Verify recipient and rolling contact limits across coordinators, including
  concurrent sends, repeat submissions, reminders, and expiry boundaries.
- Exercise interest without consent, decline privacy, clarification privacy,
  explicit consent, withdrawal, changed staff recipient, and one-time introduction.
- Check eligibility again after opt-out, suspension, unavailability, deletion,
  coordinator revocation, staff revocation, and while email is queued.
- Inspect denied API, page, data-route, and search responses for field-level leaks,
  including account emails, private messages, recipient identities, and house.
  Verify administrator and school roles receive no implicit directory permission.
- Exercise outcomes, member corrections, coordinator reassignment, minimal audits,
  immediate hiding on deletion request, and recorded manual deletion completion.
  Review the retention runbook; automated purge tests are outside scope.
- Use captured mail to verify recipients and content for requests, clarification,
  reminders, and introductions. Isolate mailbox state before assertions because
  the current capture stores the most recent message per recipient.
- Keep ordinary localhost development usable with disposable isolated test state.
  Run relevant HTTP/browser journeys, typecheck, build, and the required full suite
  when implementing. Saving this document does not establish feature completion.

## Out of Scope

- Alumni jobs, business introductions, general networking, and alumni-event outreach.
- Public or member-browsable directory, student contact disclosure, bulk export,
  bulk imports, direct chat, calendars, and automatic availability expiry.
- Dedicated phone, exact-address, employer, and photo fields; coordinator editing
  or opt-in on another member's behalf.
- Entire-account deletion and changes to membership or financial retention policy.
- Automated deletion/anonymization and scheduled purge jobs.
- Automatic profile reconfirmation emails, general digest scheduling, complete
  provider retry/recovery operations, staging, deployment, and live email.

## Further Notes

- This is a settled product scope, not evidence of implementation. Eight flat
  implementation issues were subsequently published after breakdown approval;
  see [implementation issue index](profiles-expertise-outreach-issues.md).
- Future implementation issues refer to this specification and carry their own
  acceptance criteria and blocker links. The historical roadmap numbering is a
  planning reference, not a parent/subticket structure for new issues.
- The existing prohibition on student contact disclosure takes precedence over
  the early interview's broader phrase "school representative": only the named
  verified staff representative receives a consented email introduction.
