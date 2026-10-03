# Pilot specification

## Accepted context

- One Indonesian high school, operated primarily by its alumni organization.
- Initially one school staff representative and one student representative.
- Long-term audience: the entire alumni community. Pilot: a small portion of several graduation cohorts.
- No existing alumni database. Members self-register and are validated by reference.
- Donations currently use bank transfers to ad hoc coordinators.
- Core purposes: support school activities and discover alumni willing to contribute expertise.
- Engagement centers on specific needs and reported outcomes, rather than social-media posting.
- Cloudflare-supported stack and the user's existing Resend account/domain.

## Proposed operating defaults

These refine the accepted specification and may be adjusted without changing its purpose.

- A verified alumnus endorses an applicant; an administrator makes the membership decision.
- The organization manually establishes the first trusted members. Applicants without a registered reference can request manual review.
- Email verification precedes reference requests. Pending members see their application and public initiative pages, not private directory records.
- Roles: administrator, finance coordinator, directory coordinator, school staff, student representative, alumni member. People can hold several roles; school representatives need not be alumni.
- Student proposals and updates require staff approval. School staff validate school needs; alumni administrators authorize publication.
- Bahasa Indonesia is the default interface language.

## Core workflows

### Membership and discovery

Register → verify email → submit school name/graduation year/reference → endorsement or manual review → administrator decision → maintain profile.

Profiles contain professional expertise, general location, willingness to help, and visibility/contact preferences. Only designated directory coordinators search private profiles. They can send a relevant opportunity request through the service. Students do not receive contact details. Declining outreach must be supported.

### School initiatives

Draft purpose/budget/needs → school validation → alumni publication approval → collect funds or volunteer interest → progress updates → outcome and financial report.

Each initiative has an owner, deadline, intended outcome, and support types: money, equipment, time, expertise. Monetary initiatives name a receiving bank account and its accountable coordinator. Account changes are restricted, audited, and clearly shown to contributors.

### Bank transfers

View instructions → transfer outside the platform → optional private claim/evidence → finance checks bank record → confirmed receipt → public aggregate progress.

Finance can record transfers without an online claim. Pledges and claims do not count as receipts. Corrections and duplicate resolution retain history. Reports distinguish receipts, expenses, and remaining funds, including how a closing balance will be handled. Donor identities and payment evidence are private by default.

### Engagement

Follow initiatives; choose interests and email preferences; receive meaningful progress and outcomes. Separate optional digests from essential account emails. Pilot one real initiative through closure and one expertise request.

## Pilot evaluation

Track invitation-to-registration and approval rates, profile completion, verification delays, reconciliation delays, successful expertise introductions, outcome-report completion, and repeat participation. Compare cohorts using aggregate statistics; set numeric targets with operators before launch.

## Outside the pilot

General social feed, public comments, chat, leaderboards, online payment gateway, bulk alumni imports, multi-school operation.

## Details needed later

School/organization name; graduation-year versus entry-year terminology; selected cohorts; school's timezone; first administrators; sending/reply-to addresses; application domain; receiving-account ownership; privacy/retention policy and member contact notice. These do not block local scaffolding.
