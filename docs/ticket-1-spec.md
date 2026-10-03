## Problem Statement

The alumni organization has no existing alumni database and needs to distinguish verified school membership from email ownership. Applicants need a clear path through endorsement or manual review, while administrators need accountable decisions and school representatives need access without false alumni identities. Private member and financial information must stay restricted throughout the workflow.

## Solution

Deliver a complete local membership workflow in Bahasa Indonesia: Better Auth email-code login, house-based applications and references, independent administrator review, manual eligibility checks, controlled role invitations, and audited suspension/reinstatement. Keep membership and privileged roles separate. Capture all email locally and validate the workflow with synthetic users.

## User Stories

1. As an applicant, I want to sign in using an emailed code, so that I can access my application without managing a password.
2. As an administrator, I want to use the same email-code login, so that I can review membership requests without a separate login system.
3. As an account holder, I want to have expired, reused, and repeatedly guessed codes rejected, so that my account is protected.
4. As an applicant, I want to submit my name while attending school and graduation year, so that reviewers can establish my school identity.
5. As an applicant, I want to select exactly one of the nine houses, so that reviewers can validate a key school identifier.
6. As a former student, I want to submit attendance years and request manual review, so that I can apply without claiming to have graduated.
7. As a membership administrator, I want to evaluate former-student eligibility individually, so that I can apply the organization’s membership judgment.
8. As an applicant, I want to enter a reference email without browsing private members, so that I can seek endorsement while respecting member privacy.
9. As an account holder, I want to receive neutral reference-lookup responses, so that the service does not expose registered email addresses.
10. As a reference, I want to endorse an applicant only when I am approved, share their house, and personally knew them at school, so that my endorsement supplies relevant identity evidence.
11. As a reference, I want to endorse applicants from another graduation year in my house, so that a year mismatch does not prevent a valid reference.
12. As a reference, I want to choose endorse, decline, or cannot-confirm, so that I can give an accurate response.
13. As an applicant, I want to have declined or uncertain references lead to manual review, so that one response does not automatically reject me.
14. As an applicant, I want to replace an unanswered reference after expiry or request manual review, so that my application can progress.
15. As a reference, I want to have expired or replaced requests rejected, so that I cannot accidentally act on an obsolete application.
16. As an applicant, I want to correct my house before approval and undergo fresh review, so that reviewers decide using accurate information.
17. As an approved member, I want to have house corrections handled by an administrator with fresh review, so that verified identity changes remain accountable.
18. As an applicant, I want to explain why I need manual review, so that reviewers can investigate through trusted alumni or school staff.
19. As a membership administrator, I want to review applications in a pending queue, so that I can manage work without an email for every submission.
20. As a membership administrator, I want to approve or reject an endorsed or manually checked application, so that membership remains a deliberate decision.
21. As a membership administrator, I want to be prevented from deciding my own application or one I endorsed, so that decisions have independent oversight.
22. As an applicant, I want to see my application status and required actions, so that I know what to do next.
23. As an applicant, I want to receive action and decision emails, so that I know when my participation is needed.
24. As a reference, I want to keep my response details and comments private to reviewers, so that I can provide candid feedback.
25. As a rejected applicant, I want to correct and resubmit my application, so that I can seek a new decision without erasing prior reviews.
26. As a membership administrator, I want to see one active application per account and previous reviews, so that duplicate submissions do not fragment decisions.
27. As a primary administrator, I want to privately bootstrap the first administrator and trusted alumni, so that the reference process has an accountable starting point.
28. As a primary administrator, I want to grant and revoke privileged roles, so that membership approval cannot silently grant administrative authority.
29. As a school representative, I want to accept an email-bound invitation for a specific role, so that I can participate without claiming alumni membership.
30. As a primary administrator, I want to have invitations expire after seven days and work once, so that old or reused invitations cannot grant access.
31. As a pending applicant, I want to view published initiatives while waiting, so that I can understand the community’s work before approval.
32. As a member, I want to have private directory and financial access checked on the server, so that unauthorized users cannot retrieve protected information.
33. As a membership administrator, I want to suspend or reinstate membership with a recorded reason, so that disputed memberships can be managed accountably.
34. As a suspended member, I want to sign in to view status and submit one outstanding review request, so that I can seek review while alumni privileges remain removed.
35. As a membership administrator, I want to have suspension affect existing sessions immediately, so that old sessions cannot retain alumni privileges.
36. As an account holder, I want to request an administrator-assisted verified email change, so that I can recover access while preserving an identity audit trail.
37. As a reviewer, I want to see actors, reasons, and history for decisions and role or identity changes, so that I can understand and audit prior actions.
38. As a pilot operator, I want to exercise login, applications, references, invitations, and review in Bahasa Indonesia with synthetic accounts and captured email, so that I can validate the workflow without sending live messages.

## Implementation Decisions

- Integrate authentication into the full-stack Workers application using Better Auth with the D1/Drizzle adapter. Existing password-based compatibility checks establish a starting point, not evidence that Email OTP works in Workers; verify that plugin separately.
- Use email-code login for every account, including administrators. Follow the installed Better Auth Email OTP defaults and resend/rate-limit behavior, with production-equivalent rate limits exercised during verification. Administrator MFA is deferred.
- Keep email ownership, account access, alumni membership, and privileged role assignments separate. Derive authorization on the server from current roles, ownership, and workflow state. Membership approval alone never grants administrative, finance, or directory-coordinator permissions.
- Extend the relational model with membership applications/revisions, fixed house identifiers, reference requests/responses, reviews, role assignments, school-role invitations, suspension/reinstatement decisions, review requests, and audit events. Use constraints to enforce one active application and one outstanding suspension review request per account. Preserve prior decisions and timestamps in UTC.
- Require school-time name, graduation year, and exactly one house: Komodo, Lion, Rhino, Hornbill, Dove, Eagle, Dolphin, Shark, or Mantaray. Do not provide an unknown-house option. Non-graduating former students instead supply attendance years and enter manual review, with house still required.
- Reference discovery accepts an email with neutral responses; it does not expose a private membership search. One approved same-house alumnus who personally knew the applicant at school may endorse; graduation year need not match. Authenticate the reference and verify eligibility on the server.
- Support endorse, decline, and cannot-confirm responses. Endorsement enables administrator review; it does not approve membership. Decline/cannot-confirm leads to manual review. Only reviewers see response details/private comments; applicants see that manual review is needed.
- Expire reference requests after seven days. Replacement invalidates the earlier request. Reject self-endorsement, replay, stale requests, and responses against superseded application data.
- House corrections before approval require fresh review and invalidate outstanding endorsements. After approval, only administrators change house and require fresh review. Preserve correction history; never silently carry an old endorsement forward.
- Manual review collects a brief explanation and uses independent checks through trusted alumni or school staff. Former students, including expelled former students, are evaluated individually. Do not collect detailed disciplinary histories or identity-document uploads.
- Rejected applicants can correct and resubmit with prior review history retained. Membership administrators cannot decide their own applications or ones they endorsed; a different administrator decides. Bootstrap the initial trusted members separately through a private, audited process.
- The organization-appointed primary administrator alone grants/revokes privileged roles and issues school-role invitations. Invitations are email-bound, limited to a specific role, valid seven days, and single use. School representatives verify email without needing alumni membership or profiles. No public role-selection form.
- Pending applicants may view published initiatives, edit their own applications, and see status. Application/house details are available only to the applicant, authorized membership administrators, and the chosen reference as needed. Enforce field-level disclosure, not only page access.
- Suspension immediately removes alumni access and endorsement privileges in existing sessions. Allow status access and one outstanding review request. Require audited reasons for suspension/reinstatement; do not conflate alumni membership with separately assigned school or privileged roles.
- Defer self-service email changes. Administrator-assisted changes require verified ownership of the new email plus an audited identity check.
- Provide login, application/status, reference response, administrator review, role/invitation, and suspension-review interactions in Bahasa Indonesia. Administrators work from a queue rather than per-application notification emails.
- Use the local email abstraction/capture for login codes, reference requests, applicant action/decision notifications, and school-role invitations. No live messages or real credentials are required.

## Testing Decisions

Accepted integration seam:

- Use the running local application’s browser/HTTP boundary as the primary integration seam, with real Workers execution, local D1, Better Auth, and captured email. Drive the complete user workflow through public routes/forms/endpoints; do not mock membership or authorization logic.
- Browser journeys verify Bahasa Indonesia screens and navigation. HTTP requests at the same application boundary verify denied access, field-level privacy, request replay, and adversarial transitions that the UI cannot normally initiate.
- Test externally visible outcomes: identity/code login, eligibility enforcement, review results, persistent histories, role isolation, and notification capture. Avoid tests that assert internal function calls or mirror implementation details.
- Cover OTP expiry, single use, failed attempts and rate limits; no self-endorsement; same-house eligibility and personal-knowledge attestation; all three reference responses; expiry/replacement/replay; house correction with fresh review; manual review, rejection and resubmission; self/endorsed-application decision denial; invitation expiry/reuse/wrong-email/role escalation; private field denial; suspension with an existing session; reinstatement; and email-change verification.
- Exercise concurrent/repeated membership decisions and invitation/reference consumption so state changes and audit history cannot diverge. Inspect outcomes through supported application behavior or a restricted operator audit view.
- Prior art: local HTTP compatibility checks already exercised the starter page, D1 health query, signup, password login, session retrieval, invalid-password rejection, and logout. There is no committed automated test harness yet, and those checks do not validate the new membership or OTP behavior. Add a reusable integration harness at the application boundary.
- Build and type checks must pass. Use synthetic fixtures and captured email only. Verify production-equivalent rate limiting explicitly because Better Auth disables its limiter in development by default.

## Out of Scope

- Administrator MFA, password-based product login, self-service email changes, identity-document uploads, and detailed disciplinary records.
- Staging/production setup, deployment, real Resend delivery, or real pilot invitations.
- Implementing the directory, expertise outreach, initiatives, finance, or digests from later tickets. Ticket 1 establishes and tests their authorization boundaries; it does not implement those products.
- Bulk alumni import, social feed, comments, chat, leaderboards, payments gateway, or multi-school operation.
- Decomposing this specification into implementation tasks in this step.

## Further Notes

This specification synthesizes the accepted Ticket 1 interview on 2026-10-03. Ticket 0 compatibility checks pass locally, but main-app auth/D1 integration, environment templates, local email capture, and development documentation are still incomplete; complete prerequisites before claiming Ticket 1 readiness.

The tracker is GitHub Issues for akbarsahata/alumni-platform using the GitHub plugin. The user accepted the browser/HTTP integration seam and default triage labels. Published as [GitHub issue #1](https://github.com/akbarsahata/alumni-platform/issues/1) with ready-for-agent. Complete outstanding foundation prerequisites during implementation.

Better Auth references: [Email OTP](https://better-auth.com/docs/plugins/email-otp) and [rate limiting](https://better-auth.com/docs/concepts/rate-limit). Verify the installed plugin in the actual Workers runtime rather than treating documentation or password compatibility as the acceptance result.
