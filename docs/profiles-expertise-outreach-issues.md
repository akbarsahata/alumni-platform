# Profiles and school outreach implementation issues

Published on 2026-10-07 through the GitHub plugin after the user approved the eight
vertical slices. Scope: [local specification](profiles-expertise-outreach-spec.md).
At publication, each issue was open and labeled `ready-for-agent`; blockers determine the runnable
frontier. These are flat issues, without parent issues or decimal subtickets.

| Issue                                                           | Title                                                  | Blocked by                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [#13](https://github.com/akbarsahata/alumni-platform/issues/13) | Maintain a private expertise profile                   | None                                                                                                                             |
| [#14](https://github.com/akbarsahata/alumni-platform/issues/14) | Search eligible alumni and maintain expertise tags     | [#13](https://github.com/akbarsahata/alumni-platform/issues/13)                                                                  |
| [#15](https://github.com/akbarsahata/alumni-platform/issues/15) | Submit and independently approve school needs          | None                                                                                                                             |
| [#16](https://github.com/akbarsahata/alumni-platform/issues/16) | Send bounded outreach and collect interest or declines | [#14](https://github.com/akbarsahata/alumni-platform/issues/14), [#15](https://github.com/akbarsahata/alumni-platform/issues/15) |
| [#17](https://github.com/akbarsahata/alumni-platform/issues/17) | Introduce interested members with explicit consent     | [#16](https://github.com/akbarsahata/alumni-platform/issues/16)                                                                  |
| [#18](https://github.com/akbarsahata/alumni-platform/issues/18) | Clarify outreach privately                             | [#16](https://github.com/akbarsahata/alumni-platform/issues/16)                                                                  |
| [#19](https://github.com/akbarsahata/alumni-platform/issues/19) | Track outcomes and close school needs                  | [#17](https://github.com/akbarsahata/alumni-platform/issues/17)                                                                  |
| [#20](https://github.com/akbarsahata/alumni-platform/issues/20) | Process directory deletion and manual retention        | [#18](https://github.com/akbarsahata/alumni-platform/issues/18), [#19](https://github.com/akbarsahata/alumni-platform/issues/19) |

## Current frontier — 2026-10-19

The initial frontier was **#13** and **#15**. Issue #13 is implemented, including
the responsive “Profil & Keahlian” editor, required professional introduction and
single participation-consent checkbox; see the [layout decision](profile-layout.md).
Issue #14 is closed. Issue #15 is closed following the merge of
[PR #23](https://github.com/akbarsahata/alumni-platform/pull/23) on 2026-10-11,
present on local `master` at `48dea53`. The school-needs review issue
[#24](https://github.com/akbarsahata/alumni-platform/issues/24) is also closed.

The next unblocked issue is **#16**: both of its prerequisites, #14 and #15, are
complete. Issues #16–#20 remain open. Completing #16 unblocks **#17** and **#18**;
#19 follows #17, and #20 follows both #18 and #19. The table above retains the
declared prerequisite relationships even when those prerequisites are complete.

See [handoff.md](handoff.md) for the current checkout and recorded verification
boundaries. Recheck the current tracker body, labels, comments and dependencies
before starting. Each issue includes its own end-to-end
acceptance criteria, synthetic Worker/D1/captured-email HTTP and Chromium verification,
and build/typecheck requirements. Automated deletion and anonymization remain out of scope.

The GitHub plugin exposes no native blocking-link operation; dependency edges are
explicit issue links in each issue's `Blocked by` section. No parent issue was
created or modified. Existing historical membership issue structures were not changed.

Publication of the issues itself did not start their implementation. Historical
profile branch/commit details are recorded in the handoff; its opening summary
describes the current checkout and supersedes those historical branch statements.

## UI baseline for subsequent issues

Use the [shared navigation and guest-home decision](navigation-prototype.md).
Signed-in destinations belong in the existing grouped menu and are shown only to
explicitly authorized roles; multiple roles combine their menus. Add no dead links
for unimplemented workflows. Keep the primary-only menu preview aligned with new
role-based destinations, while server permission checks remain authoritative.
Guests use `/` or `/login` without a menu. Breadcrumbs and the signed-in actionable
home dashboard are deferred. Keep useful feature/parent links on pages, without
redundant Beranda links. This navigation is part of the committed baseline on
`master`; extend it when implementing #16.
