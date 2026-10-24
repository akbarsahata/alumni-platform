# School representative names

Issue [#25](https://github.com/akbarsahata/alumni-platform/issues/25) implements the
[agreed specification](school-representative-names-spec.md). Apply
`npm run db:migrate` before manual testing.

## Inviting a named representative

The primary administrator opens **Kelola peran → Undang perwakilan sekolah**
(`/admin/invitations`) and enters the recipient email, **Nama perwakilan**, one
school role and an appointment reason. The name is trimmed and must contain 1-200
characters. The same shared schema validates JSON and form submissions.

The invitation stores the name with its email and role. Only the matching
authenticated recipient can read it, including the name. Acceptance remains single
use and email-bound; guests and other signed-in accounts cannot inspect the
invitation.

Acceptance consumes the invitation, grants only its stored school role and assigns
the invited name when the account has no name yet. An existing non-empty account
name is preserved. The recipient can see the invitation name during acceptance, and
the captured invitation mail includes it.

## Setting or correcting a name

The primary administrator opens **Kelola peran** (`/admin/roles`) and uses **Nama
perwakilan sekolah**. The target must be an email-verified account with a current
`staff` or `student` role. Direct role appointments are supported; no alumni
application, membership approval or expertise profile is required.

The operation changes only `user.name`. It does not change email, roles, membership,
alumni profile fields, staff-recipient IDs, invitation bindings, approvals or
existing consent/sharing evidence. A successful change writes a restricted
`representative_name_change` record containing actor, target, old name, new name and
UTC time; the primary audit screen shows the old → new name. Repeating the same name
is a no-op and does not add history. Primary authority and target eligibility are
rechecked in the conditional insert.

API: `POST /api/admin/representative-names` with
`{ targetUserId, representativeName }`. Mutations require the trusted origin; all
responses are private/no-store.

## Display and legacy behavior

Staff selectors, school-need contact displays, introduction consent and captured
introduction mail resolve the current verified account name. The existing
`Akun staf <id-prefix>` fallback remains for accounts without a name and for legacy
records; no human name is invented from an ID or email.

School needs and introductions retain their historical snapshots. A name correction
changes the displayed identity but does not rewrite `school_need.staff_contact_name`,
approval history, invitation records or introduction evidence.

## Verification

These HTTP and browser tests belong to the `directory` CI context; run
`npm test -- --context directory` to include its shared roles bootstrap and
related fixtures. The browser journey retains name propagation, consent, captured
mail and mobile-width assertions. Its optional desktop/mobile screenshots were
removed after a stalled-font probe reproduced the CI timeout. See
[CI diagnostics](ci-testing.md#timing-and-browser-diagnostics).

```sh
node scripts/test.mjs tests/representative-names.test.mjs tests/browser/representative-names.spec.ts
node scripts/test.mjs tests/invitations.test.mjs tests/browser/invitations.spec.ts
node scripts/test.mjs tests/school-needs.test.mjs tests/browser/school-needs.spec.ts
node scripts/test.mjs tests/introductions.test.mjs tests/browser/introductions.spec.ts
npm run typecheck
npm run build
npm run lint
npm run format:check
npm test
```
