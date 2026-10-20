# School representative names

Agreed scope: 2026-10-20. Implementation issue: [#25](https://github.com/akbarsahata/alumni-platform/issues/25).

## Problem

Email-code sign-in can create `user.name` as an empty string. School invitations
collect email, role and reason, and acceptance collects no name. Staff-only and
student-only accounts do not qualify for alumni profile editing. Consequently,
verified staff selectors display the deliberate `Akun staf <id-prefix>` fallback
instead of a recognizable representative name. Local investigation reproduced one
verified staff account with a blank name; this is an onboarding gap rather than a
selector formatting bug.

## Agreed behavior

- Require **Nama perwakilan** when the primary administrator invites a staff or
  student representative. Trim and validate a non-empty name of at most 200
  characters through the shared server schema for JSON and form submissions.
- Persist the invited name with the email-bound invitation. Show the name to the
  matching authenticated recipient during acceptance; retain the existing guest
  and wrong-email privacy boundaries.
- Acceptance establishes the representative name for an otherwise unnamed
  account, atomically with successful invitation consumption and role assignment.
  An invitation must not silently overwrite an existing non-empty account name;
  use the administrator's explicit name-correction action for that case.
- Provide a primary-administrator-only way to set or correct a name on existing
  verified staff/student accounts, including accounts appointed through role
  management rather than invitations. The existing role-management screen may
  host this operation. No alumni application, membership approval or expertise
  profile is required.
- Resolve staff selectors, school-need contact displays, introduction consent and
  introduction email names consistently from the saved representative identity.
  Continue deriving contact identity from the selected verified account; never
  restore arbitrary caller-supplied `staffContactName` on school needs.
- Preserve existing unnamed accounts and invitations through migration. Keep the
  fallback available for legacy records until the administrator supplies a name;
  do not fabricate human names from IDs or email addresses. Legacy invitations
  remain usable under their existing email/role/expiry rules.
- Name correction changes only the display identity of the same account. It must
  not change email, membership facts, alumni profile fields, roles, staff-recipient
  IDs, invitation bindings, approvals or existing consent/sharing evidence.
  Preserve historical records rather than rewriting them. Recheck primary
  authority and target eligibility at the write boundary and record restricted
  actor/target/time evidence of successful name changes.
- Keep product copy in Bahasa Indonesia. Preserve trusted mutation origins,
  private no-store responses, field-level projections and current role boundaries.
  Staff/student names must not expose account email in directory, status or
  general outreach-audit projections.

## Verification and delivery

Use the established real local Worker/D1/Better Auth/captured-mail HTTP and
Chromium seam with synthetic accounts. Cover named invitation issuance and
acceptance without alumni membership, blank/whitespace/overlength rejection,
existing-name preservation and explicit correction, legacy missing names,
unauthorized edits and role revocation, stale/replayed/concurrent acceptance,
wrong-email/guest privacy, and consistent names in staff selectors, consent and
captured introduction mail. Confirm name correction preserves email, roles,
membership and existing consent/sharing records through supported behavior.

Run relevant journeys, the full suite, typecheck, build, lint and formatting.
Document migrations and apply them to ordinary local D1; preserve localhost
manual testing and record exact evidence in the handoff.

## Dependencies and scope limits

Build on the existing invitation (#7), school-needs (#15) and introduction (#17)
implementations in the current checkout. No new sequencing blocker is introduced.
This is a standalone implementation issue, not a parent specification issue.

General account-profile editing, representative self-service name changes,
membership-name corrections, email changes, new permissions, deployment and live
email are out of scope.
