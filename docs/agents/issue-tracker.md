# Issue tracker: GitHub

Specifications live locally in `docs/`; implementation tasks live in GitHub Issues for `akbarsahata/alumni-platform`. Use the GitHub plugin for reading, searching, publishing, updating, labeling, and closing issues. Pass the explicit repository identity in tool calls.

## Conventions

- Search existing issues before publishing to avoid duplicates.
- Synthesize the agreed scope into a descriptive local specification before creating implementation issues. A skill's specification-publishing step produces a local document here; publish implementation tasks only when requested.
- Create flat implementation issues with descriptive titles and references to the local specification. Keep each issue independently reviewable with acceptance criteria and explicit blockers where necessary.
- Do not create parent specification issues, sub-issues, or pseudo-subticket titles such as Ticket 1.1 and Ticket 1.2. Existing historical issue structures remain historical references.
- When fetching a ticket, read the issue body, labels, and relevant comments.
- Apply the state label mapped in triage-labels.md; preserve unrelated labels when updating state.
- If a required plugin operation is unavailable, report the limitation before using a different tracker workflow.
- For sequencing, use native dependencies when available, otherwise record explicit blocker references between the flat issues.

## Pull requests as a triage surface

**PRs as a request surface: no.**
