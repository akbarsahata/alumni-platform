# Implementation tickets

All tickets are pending. Work sequentially: 0 → 1 → 2 → 3 → 4 → 5. Keep each change reviewable and update the session handoff.

## 0 — Cloudflare foundation and authentication compatibility

Create the TypeScript/React Router Worker application, local D1 bindings and Drizzle migrations, environment templates and an email abstraction with local capture. Validate the authentication candidate before adopting it. Document local development and deployment commands.

Acceptance: pinned dependencies build and type-check; a local Worker serves a page; a D1 migration/query succeeds; the chosen auth adapter creates and revokes sessions in the Workers runtime; no real credentials or email required. Record compatibility findings. Provide .gitignore before generating local databases or secrets. Do not provision or deploy production resources as part of this ticket.

## 1 — Membership, references, and permissions

Implement email verification, applications, authenticated reference endorsement, manual review, administrator decisions, and role checks. Establish initial trusted members through a documented bootstrap process, never a public role-selection form.

Acceptance: references can endorse/decline/cannot-confirm; no self-endorsement; stale or replayed requests cannot change decisions; manual review is available; decision and role changes are audited; pending applicants and students cannot access private directory or financial records; staff accounts do not require false alumni profiles. Verify token expiry/reuse and server-side access denial. Configure supported administrator MFA before live use.

## 2 — Profiles, expertise search, and contact requests

Implement editable profiles, expertise tags, availability, cohort filters, visibility/contact preferences and coordinator outreach. Include profile confirmation date and deletion-request handling.

Acceptance: only designated coordinators discover private records; searches respect member preferences; requests reach eligible members through the email abstraction without disclosing their contact details to students; declined contact preferences are enforced server-side; bulk export is unavailable in the pilot. Test ownership and field-level disclosure boundaries.

## 3 — School initiatives and approval

Implement draft/review/published/closed lifecycle, budget in IDR, support types, ownership, staff validation, alumni publication approval and versioned bank instructions.

Acceptance: student content cannot bypass staff review; school validation and publication approval are recorded; account changes are restricted and audited; approved content changes trigger appropriate re-review; contributors can identify the receiving account holder and initiative owner. Test invalid transitions and unauthorized changes.

## 4 — Bank transfers and financial reporting

Implement private claims/evidence, manual finance reconciliation, receipts without claims, duplicate resolution, corrections, expenses and financial summaries. Snapshot the relevant bank-instruction version in a claim.

Acceptance: only confirmed receipts affect progress; concurrent/repeated confirmation cannot double-count; partial/mismatched transfers remain reviewable; corrections/refunds preserve history; totals distinguish received/spent/remaining; closure records disposition of balance; evidence downloads require ownership or finance permission. Test authorization, idempotency and integer-money calculations.

## 5 — Engagement, recovery, and pilot launch readiness

Implement initiative follows, notification preferences, progress/outcome reports, optional digest scheduling and staff approval of student updates. Finish outbox retries and delivery handling. Add aggregate pilot metrics and cohort invitations.

Acceptance: optional updates respect preferences; account mail remains separate; retried jobs do not ordinarily duplicate email; closures show outcomes and finances; operators can inspect aggregate participation and outstanding reviews. Verify data recovery, administrator MFA, retention settings, and an end-to-end synthetic pilot covering membership, funding and expertise outreach. Document account owners and deployment configuration. Coordinate the actual pilot invitation/send separately with the user.

## Definition of done for each session

Relevant acceptance criteria exercised; build/type checks pass; consequential workflow tests pass; migrations and configuration documented; handoff updated with exact checks, remaining risks and next ticket. Do not describe unfinished or untested behavior as complete.
