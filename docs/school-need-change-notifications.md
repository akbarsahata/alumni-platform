# School-need change notifications — candidate minor scope

Status: needs product decision. Not implemented. Tracked as
[#30](https://github.com/akbarsahata/alumni-platform/issues/30).

## Requested outcome

Notify alumni participants when the validated details of a school need change after
they have accepted, expressed interest in, or consented to contribute to it.

## Specification check

- [Pilot specification](pilot.md) expects engagement through meaningful progress and
  outcomes, with optional digests kept separate from essential account email.
- [Profiles, expertise discovery, and school outreach](profiles-expertise-outreach-spec.md)
  says purpose, commitment, timing, payment terms, and location are immutable once a
  need is sent. Material changes require closing and replacing the need with fresh
  responses and consent. A changed staff recipient similarly requires fresh consent.
- Current code enforces this by allowing edits only while no outreach request exists
  and the need has not been closed.
- No duplicate issue was found in the current open or closed tracker. Issue #30 now
  tracks this candidate scope. Issue #19 covers closure and outcomes, #18 covers
  private clarification, and #17 covers consent.

## Recommended spec-compliant scope

Notify interested or consented participants when a sent need is closed or replaced,
linking to the authenticated request and the replacement need where applicable. Keep
the original sent details frozen, do not reuse consent, and do not put private
details or email addresses in the notification. This extends the existing captured
email/outbox boundary rather than adding live delivery.

## Open decision

1. Implement only the closure/replacement notification above (recommended; no spec
   change).
2. If in-place changes after acceptance are required, decide how edits are
   revalidated, reapproved, and subjected to fresh consent, and amend the accepted
   outreach specification first.

## Non-goals

- Automatically re-consenting participants or transferring responses to a
  replacement need.
- Exposing recipient identities, email addresses, or private clarification in email.
- Live email delivery, scheduled retries, or deployment.
