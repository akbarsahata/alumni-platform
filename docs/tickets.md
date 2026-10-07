# Implementation tickets

The numbered sections below are the historical pilot roadmap, not the naming or hierarchy for new GitHub issues. Consult the latest handoff for implementation status. Write agreed specifications locally first, then create flat implementation issues with descriptive titles, spec references, and explicit blockers as needed. Keep each change reviewable and update the session handoff.

## Current continuation baseline

Local records show profiles (#13) and directory discovery (#14) complete. School
needs and independent approval (#15) is being implemented on PR #23; issue #16
remains blocked until #15 is complete. Follow the
[implementation index](profiles-expertise-outreach-issues.md) and
[shared navigation decision](navigation-prototype.md): role-based grouped menus,
guest login on `/`, no breadcrumbs, and a deferred actionable home dashboard.
The latest working-tree and focused verification boundary is at the top of
[handoff.md](handoff.md).

## 0 — Cloudflare foundation and authentication compatibility

Create the TypeScript/React Router Worker application, local D1 bindings and Drizzle migrations, environment templates and an email abstraction with local capture. Validate the authentication candidate before adopting it. Document local development and deployment commands.

Acceptance: pinned dependencies build and type-check; a local Worker serves a page; a D1 migration/query succeeds; the chosen auth adapter creates and revokes sessions in the Workers runtime; no real credentials or email required. Record compatibility findings. Provide .gitignore before generating local databases or secrets. Do not provision or deploy production resources as part of this ticket.

## 1 — Membership, references, and permissions

Implement the complete Bahasa Indonesia workflow for Better Auth email-code login, membership applications, authenticated reference responses, manual review, administrator decisions, and server-side permissions. All accounts, including administrators, use email-code login. Follow the installed Better Auth Email OTP behavior rather than inventing expiry/resend rules; validate it in the Workers runtime. Administrator MFA is deferred to a later improvement and is not a Ticket 1 or pilot completion requirement.

### Applications and references

- Require name while attending school, graduation year, and exactly one house: Komodo, Lion, Rhino, Hornbill, Dove, Eagle, Dolphin, Shark, or Mantaray. Do not offer an unknown-house choice or a manual-review bypass for missing house information.
- Former students who did not graduate provide attendance years instead of a false graduation year and use manual review. Eligibility, including expelled former students, is decided individually.
- Applicants enter a reference email; responses must not disclose whether the address has an account. An eligible reference is an approved alumnus from the same house who personally knew the applicant at school. Matching graduation year is not required.
- Require one endorsement followed by an administrator decision. References can endorse, decline, or cannot-confirm; no self-endorsement. Decline/cannot-confirm triggers manual review rather than automatic rejection.
- Reference requests expire after seven days. Applicants can replace the reference or request manual review; replacements invalidate earlier requests. House corrections before approval invalidate outstanding endorsements and require fresh review; after approval, only administrators change house, with a fresh review.
- Manual review uses an applicant explanation and independent checks with trusted alumni or school staff, without identity-document uploads. Rejected applicants may correct and resubmit; preserve every review's history. Allow only one active application per account.

### Permissions and administration

- Bootstrap the organization-appointed primary administrator and initial trusted alumni through a documented private, audited process; never expose public role selection.
- Membership administrators approve/reject applications. Only the primary administrator grants/revokes privileged roles. Administrators cannot decide their own applications or applications they endorsed; another administrator decides.
- Invite staff/student representatives through primary-administrator invitations: bound to one email and role, single use, seven-day expiry. Email verification is required; no alumni application/profile is required for school roles.
- Pending applicants can view published initiatives, edit their own application, and see status. They cannot access private directory or financial records. School roles do not automatically grant directory or finance permissions.
- Application details and house are visible only to the applicant, membership administrators, and chosen reference as needed for review. Reference comments and response details stay private to reviewers; applicants see only that manual review is needed.
- Administrators may suspend/reinstate membership with an audited reason. Suspension immediately removes alumni permissions and endorsement privileges, including in existing sessions. Suspended users may sign in to view status and have one outstanding review request.
- Defer self-service email changes. Administrator-assisted changes verify the new email and perform an audited identity check.

### Notifications and acceptance

Capture email locally: send codes, endorsement requests, applicant action requests, decisions, and school-role invitations. Administrators review a pending queue instead of receiving an email for each application. No live email or credentials are required.

Acceptance: the login/application/endorsement/review screens support an end-to-end synthetic local workflow; OTP expiry/reuse and server rate limits are exercised; stale/replayed/replaced requests cannot change decisions; same-house and personal-knowledge requirements are enforced; denied requests cannot disclose private fields; house corrections trigger fresh review; rejection/resubmission and suspension/reinstatement preserve history; conflicts of interest are denied; invitations cannot grant extra roles; decision, identity and role changes retain actor/reason/history. Build and type checks pass. Staging, deployment, live Resend delivery, and MFA are out of scope.

## 2 — Profiles, expertise search, and contact requests

The agreed scope now lives in [Profiles, expertise discovery, and school outreach](profiles-expertise-outreach-spec.md). That specification supersedes this section's earlier summary. It covers explicit opt-in, coordinator-only discovery, staff-validated needs, separate sharing consent, bounded outreach, profile confirmation, and manually processed directory deletion. Automated deletion is out of scope. See the [flat implementation issue index](profiles-expertise-outreach-issues.md) for published tasks and blockers.

Acceptance and testing decisions are defined in the local specification, using the confirmed real Worker/D1/captured-email HTTP and Chromium seam.

## 3 — School initiatives and approval

Implement draft/review/published/closed lifecycle, budget in IDR, support types, ownership, staff validation, alumni publication approval and versioned bank instructions.

Acceptance: student content cannot bypass staff review; school validation and publication approval are recorded; account changes are restricted and audited; approved content changes trigger appropriate re-review; contributors can identify the receiving account holder and initiative owner. Test invalid transitions and unauthorized changes.

## 4 — Bank transfers and financial reporting

Implement private claims/evidence, manual finance reconciliation, receipts without claims, duplicate resolution, corrections, expenses and financial summaries. Snapshot the relevant bank-instruction version in a claim.

Acceptance: only confirmed receipts affect progress; concurrent/repeated confirmation cannot double-count; partial/mismatched transfers remain reviewable; corrections/refunds preserve history; totals distinguish received/spent/remaining; closure records disposition of balance; evidence downloads require ownership or finance permission. Test authorization, idempotency and integer-money calculations.

## 5 — Engagement, recovery, and pilot launch readiness

Implement initiative follows, notification preferences, progress/outcome reports, optional digest scheduling and staff approval of student updates. Finish outbox retries and delivery handling. Add aggregate pilot metrics and cohort invitations.

Acceptance: optional updates respect preferences; account mail remains separate; retried jobs do not ordinarily duplicate email; closures show outcomes and finances; operators can inspect aggregate participation and outstanding reviews. Verify data recovery, retention settings, and an end-to-end synthetic pilot covering membership, funding and expertise outreach. Document account owners and deployment configuration. Coordinate the actual pilot invitation/send separately with the user.

## Definition of done for each session

Relevant acceptance criteria exercised; build/type checks pass; consequential workflow tests pass; migrations and configuration documented; handoff updated with exact checks, remaining risks and next ticket. Do not describe unfinished or untested behavior as complete.
