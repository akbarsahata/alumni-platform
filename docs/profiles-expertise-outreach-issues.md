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

The initial frontier was **#13** and **#15**. Issue #13 is implemented and locally
verified; see the 2026-10-07 private-profile entry in [handoff.md](handoff.md).
The next runnable issues are **#14** and **#15**. Each issue includes its own end-to-end
acceptance criteria, synthetic Worker/D1/captured-email HTTP and Chromium verification,
and build/typecheck requirements. Automated deletion and anonymization remain out of scope.

The GitHub plugin exposes no native blocking-link operation; dependency edges are
explicit issue links in each issue's `Blocked by` section. No parent issue was
created or modified. Existing historical membership issue structures were not changed.

The specification and this index are local working-tree documents. Issue publication
does not imply that documentation has been committed or pushed. No implementation
was started by this publication step.
