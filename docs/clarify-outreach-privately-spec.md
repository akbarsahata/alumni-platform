# Clarify outreach privately

Agreed scope: 2026-10-21. Implementation issue:
[#18](https://github.com/akbarsahata/alumni-platform/issues/18). This specification
is local and has not been published as a parent issue. It implements the private
clarification portion of
[Profiles, expertise discovery, and school outreach](profiles-expertise-outreach-spec.md).

## Problem Statement

An approved alumnus may receive a bounded school outreach request and still have a
question about the purpose, timing, commitment, location, payment terms, or the
named staff contact before expressing interest or giving email-sharing consent.
Today the request page offers only “Saya berminat” or “Tolak permintaan.” Asking a
question through ordinary email would expose the member's contact address and would
not stay attached to the request record. Declining because of an answerable
uncertainty loses a potentially suitable volunteer.

A directory coordinator also needs to answer such a question privately. The answer
must not alter the frozen terms of the sent request, must not extend the response
or consent deadline, must not bypass membership/profile eligibility or
cancellation, and must not disclose the exchange to school staff or students. A
clarification message is neither interest nor sharing consent.

## Solution

Add a private clarification thread to each outreach request. The request recipient
and current directory coordinators can read it and post timestamped text messages.
The member can ask before or after expressing interest. A coordinator can answer
without editing the sent school need. Staff and students never receive the thread
through need pages, aggregate progress, APIs, or React Router data responses.
Primary administrators see only a minimal audit event and gain no message access
from primary status alone.

Each new message sends a captured-email notification to the relevant party with an
authenticated link back to the request. The notification contains no message text
and no account email address. The thread remains readable after the request ends
for the later manual retention workflow, but new messages stop when the request is
declined, cancelled, closed, or expired. No automated purge is introduced.

## User Stories

1. As an approved alumnus, I want to ask a directory coordinator a private question about a request, so that I can resolve uncertainty before deciding whether to help.
2. As an alumnus, I want to ask before expressing interest, so that a question is not treated as a commitment.
3. As an alumnus, I want to ask after expressing interest but before sharing my email, so that I can clarify terms without releasing contact details.
4. As an alumnus, I want to see the coordinator's reply attached to the same request, so that I do not have to reconstruct the context from ordinary email.
5. As an alumnus, I want every message to show its timestamp and whether it came from me or a directory coordinator, so that I can follow the exchange.
6. As an alumnus, I want to be notified by email when a coordinator replies, so that I do not miss an answer before the deadline.
7. As an alumnus, I want the notification to link to the authenticated request, so that private content is not copied into email.
8. As an alumnus, I want clarification to remain private from school staff and students, so that my questions and identity are not disclosed outside the directory process.
9. As an alumnus, I want clarification not to share my email, so that asking a question cannot trigger an introduction.
10. As an alumnus, I want clarification not to be recorded as interest or consent, so that my response and sharing choices remain separate.
11. As an alumnus, I want clarification not to extend the response or consent deadline, so that the bounded outreach rules still apply.
12. As an alumnus, I want clarification not to revive a cancelled or expired request, so that cancellation and eligibility rules cannot be bypassed.
13. As an alumnus, I want to be told that sent terms are frozen, so that I know a changed commitment requires a replacement need and fresh response/consent.
14. As an alumnus, I want to read the thread after the request ends, so that the record remains available for later retention handling.
15. As an alumnus, I want to be unable to read another member's clarification thread, so that private exchanges stay scoped to their own request.
16. As a directory coordinator, I want to see which request a clarification belongs to, so that I can answer with the correct context.
17. As a directory coordinator, I want to reply privately to the member, so that uncertainty can be resolved without ordinary email.
18. As a directory coordinator, I want to be notified when a member asks a question, so that I can answer before the response deadline.
19. As a directory coordinator, I want any current directory coordinator to be able to read and answer the thread, so that an absent or departed coordinator does not strand the member.
20. As a directory coordinator, I want audited takeover to change the accountable coordinator and future notification target, so that reassignment has a clear effect.
21. As a directory coordinator whose role was revoked, I want to lose access immediately, so that former authority cannot read or post private clarification.
22. As a directory coordinator, I want the thread to be read-only after a request is declined, cancelled, closed, or expired, so that conversation cannot look like a live response channel.
23. As a directory coordinator, I want clarification not to edit the sent need, so that purpose, commitments, timing, location, payment terms, and staff recipient stay frozen.
24. As a directory coordinator, I want to obtain staff input outside the thread, so that staff do not become participants in a private member exchange.
25. As a directory coordinator, I want a clear notice that material changes require a replacement need, so that I do not silently renegotiate sent terms in a message.
26. As a school staff representative, I want need pages and aggregate progress to omit clarification text and participant identities, so that I see only the progress I am permitted to see.
27. As a student representative, I want the same aggregate-only view, so that I never receive alumni contact details or private questions through outreach.
28. As the primary administrator, I want a minimal audit event for clarification activity, so that significant actions are traceable without reading private messages.
29. As the primary administrator, I want primary status alone to grant no clarification access, so that audit authority does not become directory search authority.
30. As an operator, I want clarification messages retained with immutable timestamps, so that the later manual retention and profile-deletion workflow can identify what must be removed.
31. As an operator, I want no automated deletion or scheduled purge in this slice, so that retention remains a documented manual procedure.
32. As a member or coordinator, I want a message saved even if the notification cannot be captured, so that the in-app conversation remains the source of truth.
33. As a member or coordinator, I want email notifications to omit message text and email addresses, so that captured mail does not become a second uncontrolled copy of the exchange.
34. As a member or coordinator, I want concurrent messages to appear in chronological order, so that a rapid exchange still reads coherently.
35. As a developer, I want origin protection, authentication, field-level projections, and no-store responses on clarification reads and writes, so that the private thread follows the existing outreach security boundary.

## Implementation Decisions

### Thread model

- Each outreach request has at most one clarification thread. The thread is a
  chronological sequence of immutable messages; there is no separate
  coordinator-only note channel and no per-message recipient list.
- Every message records its author, the request, the need, the author's role at
  posting time (`member` or `coordinator`), the trimmed text, and a UTC timestamp.
  The role snapshot keeps attribution stable if roles change later.
- The request recipient is the only member who can see the thread. Any account
  currently holding the directory-coordinator role can see it. This deliberately
  follows the existing request access predicate rather than restricting access to
  the assigned coordinator alone.
- The request API and page project messages as role label, text, timestamp, and
  whether the viewer authored the message. Author account IDs and account emails
  are not projected to either party.
- Text is rendered as plain text with whitespace preserved; no HTML or Markdown is
  accepted. Validation trims the text and requires 1–2,000 characters through the
  shared server schema. The form disables while submitting.

### When the thread is writable

- New messages are accepted only while the request status is `pending` or
  `interested`, the response deadline has not passed, the need remains open, and
  the recipient remains in the outreach eligibility projection.
- A declined, cancelled, closed, expired, or no-longer-eligible request leaves the
  thread readable but read-only. This prevents clarification from appearing to
  extend the deadline or bypass cancellation, closure, or eligibility rules.
- Posting a message does not alter request status, response, decline reason,
  deadline, coordinator assignment, need version, need fields, consent, or sharing
  evidence. Clarification is never interest or consent.
- The write path has no access to school-need fields. The interface states that
  clarification does not change the frozen terms and that material changes require
  closing the need and using a replacement need with fresh approvals, responses,
  and consent.
- Staff and students are not thread participants. Coordinator copy states that any
  needed staff input is obtained outside this private exchange.

### Authorization and reassignment

- Thread reads and writes use the existing request-scoped access rule: the request
  recipient or any current directory coordinator. A member cannot access another
  member's request, and a coordinator without the current role cannot access any
  thread.
- Authorization is rechecked at the write boundary, not only when the page loads.
  Role revocation therefore blocks the next read and write immediately.
- The existing audited takeover action remains the reassignment mechanism. It does
  not copy, rewrite, or hide messages. All current directory coordinators already
  share read/reply access, so takeover changes the accountable coordinator and the
  notification target rather than the thread audience.
- Primary status grants no clarification access by itself. A primary administrator
  who also holds the directory-coordinator role has exactly that role's access.

### Notifications

- A member-authored message notifies the request's current assigned coordinator.
  A coordinator-authored message notifies the request recipient. No message is
  sent to staff, students, or other members.
- If the assigned coordinator no longer holds the directory-coordinator role and is
  not the author, no clarification email is sent. The thread remains available to
  current coordinators through the request page, and takeover can assign
  accountability. Self-notification is skipped.
- Notification mail is sent only after the message commits. It contains a Bahasa
  Indonesia subject, a short notice that a private clarification is waiting, and an
  authenticated link to the request page. It contains no message text, need
  details, member name, school name, or account email address.
- Notification capture is best effort in this slice. If capture fails, the message
  remains saved and the response reports that the email notification was not
  captured. There is no clarification outbox, scheduled retry, or crash recovery;
  complete provider recovery remains out of scope.
- The captured mailbox is development-only and follows the existing local mail
  boundary. No live email or deployment is part of this work.

### Persistence and retention

- Add the next sequential migration (0022) with a clarification-message table. It
  references the school need, outreach request, and author; constrains the author
  role and non-empty text; and indexes request chronology.
- An insert trigger records a minimal outreach audit event with the actor, need,
  action, and UTC time. It records no message text, author name, or email address.
  The primary audit screen gains a Bahasa Indonesia label for this action.
- Messages are immutable in this slice: there is no edit or delete endpoint, and no
  purge or retention timer is added. Message timestamps and request-end timestamps
  remain available for the manual retention and profile-deletion workflow.
- No changes are made to request status, deadlines, eligibility views, need
  immutability triggers, consent, or introduction evidence.

### HTTP, page, and data-route contracts

- The existing request read response and request page add a clarification
  collection and a `canClarify` access flag. They remain request-scoped and
  no-store. The coordinator need workspace does not gain message text; each request
  card gains a link to the authenticated request page where the thread lives.
- Add one authenticated, origin-protected clarification write route under the
  request. It accepts only a strict object containing the message text. Unsupported
  methods return 405. Invalid text returns 400, inaccessible requests return 404,
  and a closed thread returns 409. Successful writes return a changed flag and a
  notification-captured flag.
- The React Router form action uses the same write operation and revalidates the
  request page. Its success copy distinguishes a saved message from a saved message
  whose email notification was not captured.
- The existing no-store middleware and trusted-origin handling continue to cover
  API responses, pages, and React Router data responses.

### Interface copy and placement

- Add a **Klarifikasi privat** section to the request page for both the member and
  current coordinators. It shows the privacy boundary, the frozen-terms notice, the
  message list, and the form when the thread is writable. When read-only, it
  explains that the request has ended but the record remains visible.
- Member copy explains that clarification does not express interest, does not share
  email, and does not extend the deadline. Coordinator copy explains that staff and
  students cannot see the exchange and that material changes need a replacement
  need.
- On a coordinator's need page, each request card links to the request page with
  copy such as **Buka klarifikasi privat**. No clarification text is rendered on the
  need page itself.

## Testing Decisions

The confirmed seam is the existing real local Worker, disposable D1, Better Auth,
and captured-email boundary, exercised through supported HTTP routes and Chromium
with synthetic accounts. No new seam, repository mock, or authorization substitute
is introduced. This matches the role, membership, outreach, and introduction
integration suites.

A good test asserts externally observable behavior: supported request/page/data
routes, rendered text, persisted records through later reads, captured mail, audit
output, and status codes. It does not mirror repository method names or assert
private query structure.

- Add a focused HTTP clarification suite using the existing synthetic account,
  outreach, membership, and captured-mail helpers. Add it to the default integration
  runner so the full suite covers it.
- Add a Chromium clarification journey as a separate spec, picked up by the existing
  Playwright suite.
- Cover a member asking on a pending request and an interested request; assert the
  message persists with a timestamp, the request status and deadline are unchanged,
  and no interest, consent, or introduction is created.
- Cover a coordinator reading and replying, and a second current coordinator reading
  and replying. Assert both appear to the member and that a current coordinator can
  access after takeover.
- Cover notification targeting: a member message captures mail for the assigned
  coordinator with an authenticated request link, and a coordinator message captures
  mail for the member. Assert the notification contains neither the message text nor
  either account email. Confirm no staff or student mailbox receives clarification
  mail.
- Cover notification target changes after audited takeover and no notification when
  the former assigned coordinator no longer holds the role. Assert self-notification
  is skipped.
- Cover denial and anti-leak cases for another member, staff, student, primary
  administrator without directory authority, revoked coordinator, and unauthenticated
  guest on the API, page, and React Router data route. Assert 401/404, no-store, and
  no message or email leakage. Cover a valid coordinator accessing a different
  request without seeing another request's messages.
- Cover origin protection on the write route, 405 for unsupported methods, and 400
  for empty, whitespace-only, overlength, and extra-field payloads.
- Cover read-only behavior after decline, cancellation through need closure,
  eligibility-driven cancellation, and expiry. Assert writes return 409 and the
  existing messages remain readable.
- Assert staff and student need pages and aggregate progress omit message text and
  author identities. Assert primary audit output contains the minimal clarification
  action with actor, need, and time but no text or email, and that audit access
  still requires primary authority.
- Assert notification failure does not roll back the message. If a deterministic
  local failure cannot be produced through supported behavior, document that
  limitation rather than mocking repository internals.
- The Chromium journey uses a member on a mobile viewport to send a clarification,
  sees the message without horizontal overflow, then has a coordinator open the need,
  follow the clarification link, read the thread, and reply. The member sees the
  reply. Staff and student need pages are checked for absence of the text.
- Run the focused HTTP and browser journeys, the required full suite, typecheck,
  build, lint, and format checks. Record exact commands, results, screenshots, and
  the local/remote delivery boundary in the handoff.

## Out of Scope

- Staff participation in clarification or any staff-visible thread. Coordinators
  obtain staff input outside this exchange.
- Editing a sent school need, proposed changed terms inside the thread, replacing a
  staff recipient through clarification, or recording agreed changes as a new
  request. Material changes use the existing replacement-need and fresh-consent
  flow.
- Changing request status, response, decline reason, deadline, eligibility, consent,
  or introduction state from a clarification action.
- Attachments, images, rich text, Markdown, links rendered as HTML, reactions,
  editing, deleting, read receipts, typing indicators, unread badges, real-time
  delivery, or general chat.
- Separate coordinator-internal notes or a member-to-staff conversation.
- Automated retention, anonymization, scheduled purge, or a deletion UI. The later
  manual deletion and retention issue owns those procedures.
- A clarification notification outbox, scheduled retry, crash recovery, or complete
  provider delivery handling. Notification capture is best effort in this slice.
- New rate-limit or abuse-detection schemes beyond existing authentication,
  authorization, validation, and origin protection.
- Email content beyond a private notice and authenticated link.
- Deployment, live email, staging, and pushing local work.

## Further Notes

- This slice adds no environment variables or remote resources. The local migration
  is applied to the existing disposable test state and normal local database.
- The notification uses the current account email and the existing captured-mail
  adapter. It does not add member email to a clarification record or any general
  audit projection.
- Ordinary localhost manual testing must remain available. Automated verification
  uses isolated disposable state with synthetic accounts.
- The implementation handoff should document the migration, the exact focused and
  full-suite evidence, the browser screenshots, and that no push, deployment, or
  live email occurred. Existing outreach operating documentation should gain a short
  clarification section.
