# Coordinator expertise discovery

Issue [#14](https://github.com/akbarsahata/alumni-platform/issues/14) implements
coordinator search and shared expertise vocabulary from
[the agreed specification](profiles-expertise-outreach-spec.md).

## Local use

Run `npm run db:migrate`, then use ordinary `localhost:5173`. The primary
administrator assigns the separate `directory-coordinator` role through
`/admin/roles`. Assigned coordinators see “Direktori keahlian” on the home page.
Primary status, membership approval, staff, student, finance, and membership
administration never imply directory access. Current assignments are reloaded on
every request; revocation blocks existing sessions. Suspension of alumni membership
leaves an independently assigned coordinator role intact.

- `/directory` and `GET /api/directory`: eligible alumni search.
- `/directory/:userId` and `GET /api/directory/:userId`: current eligible profile.
- `/directory/tags` and `GET/POST /api/directory/tags`: shared vocabulary.
- `GET /api/directory/tags/audit`: the latest 100 minimal taxonomy events.

Private responses, including denied page and React Router data requests, use
`Cache-Control: no-store`. Mutations require the existing trusted Origin policy.
There is no export endpoint or member-browsable directory.

## Search and eligibility

Filters: `expertise` (stable tag ID), `introduction`, `city`, `country`, `helpType`,
`availability` (`available` or `limited`), `graduationFrom`, `graduationTo`,
`attendanceFrom`, `attendanceTo`. Text filters match case-insensitive substrings;
location text matches human-readable catalogue labels, including legacy locations.
The directory UI reuses profile searchable city/country multi-selects without helper
subtitles. Repeated `city` and `country` parameters accept canonical location IDs;
choices within one field match any selected location, while different filters intersect.
Combined filters intersect. Former-student attendance filters match overlapping
attendance ranges, while graduation ranges apply only to graduates. Do not assign
a graduation cohort to former students or bootstrapped records without identity.
Unknown nonempty filters, including house and export, return 400; invalid or
reversed year ranges return 400. The UI submits blank filters, which are ignored.

Search returns at most 50 profiles, ordered by stable account ID. `nextCursor`
supplies the last returned ID; the next-page link preserves all filters. For the
pilot, the repository reads explicitly projected candidate rows, and the workflow
applies shared calendar-anniversary eligibility and text/location filters before
paging. No contact or house columns are selected. Details recheck eligibility;
ineligible or missing profiles return the same 404.

Owner status and discovery share the eligibility policy: approved membership,
participation on, available/limited availability, nonblank introduction, selected
expertise/help, and confirmation less than 12 calendar months old. February 29
clamps to February 28 at its next anniversary. Current membership is checked for
each query; opt-out, pause, stale confirmation, suspension and deletion markers
hide the profile immediately. Member school identity comes from the current
approved application revision. Email, house, review notes and reasons are absent
from directory projections across API, HTML and data responses.

## Vocabulary and migration

`0012_directory_taxonomy.sql` seeds the seven original tags with their existing
stable IDs and labels, preserving all existing selections. It adds persisted tag
labels, retirement, replacement links and versions, plus actor/action/time events.
A single conditional event insert and SQLite trigger atomically applies the change
and audit. Writes recheck the coordinator assignment, expected version, active tag
and unique label; races or duplicate labels produce a controlled 409. Rename only
changes the label. A changed meaning uses “Buat pengganti”: create a new ID and
retire the old tag; members select the replacement themselves. Retirement never
rewrites stored selections. Members may retain their own selected retired tags,
but cannot newly select retired tags. Profile writes recheck tag validity at their
conditional write boundary. Owner forms use the persisted vocabulary, display
existing retired selections, and offer active additions. General primary-admin
audit includes minimal taxonomy actor/action/time evidence without profile content.
The combined audit query nests sources to respect D1's compound SELECT limit.

The nullable `expertise_profile.deletion_requested_at` marker is reserved for the
later manual-deletion workflow (#19); existing records default to NULL. This issue
provides exclusion when marked, but introduces no deletion-request screen, removal,
retention job, or outreach delivery. Integration fixtures set old confirmation and
deletion timestamps only in disposable D1; assertions use supported HTTP surfaces.

Migration applied to ordinary local D1 and disposable integration D1. No new
bindings, secrets, remote migration, live email or deployment are required.

## Verification

`node scripts/test.mjs tests/directory.test.mjs tests/browser/directory.spec.ts`
passes four location helper tests, five real HTTP journeys and one Chromium journey
through Worker/D1/Better Auth/captured-email synthetic accounts. Coverage includes
all filters, role/API/page/data denials, immediate eligibility changes, privacy,
retirement/replacement and audited history, version conflicts, origin protection,
no-store and coordinator revocation in an existing browser session. Focused audit
regression verification passes seven tests in `tests/roles.test.mjs`.

Typecheck, production build, lint and formatting pass. Separate Standards and Spec
reviews report zero remaining findings after consolidation of eligibility policy.
Final `npm test` passes four helper tests, 64 HTTP tests and 11 Chromium journeys,
including the real OTP expiry window. See [handoff.md](handoff.md) for recovery,
commit and rebase evidence.
