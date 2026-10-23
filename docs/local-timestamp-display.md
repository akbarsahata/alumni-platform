# Local timestamp display

Status: `LocalTimestamp` is implemented and applied to the school-need detail page.
Applying it to every remaining timestamp is tracked in
[#31](https://github.com/akbarsahata/alumni-platform/issues/31).

## Rules

- Store and calculate all workflow instants in UTC. Do not change expiry,
  chronology, rate-limit or audit semantics for display purposes.
- Render workflow instants through `app/components/local-timestamp.tsx`. It uses
  `date-fns` with the Indonesian locale (`id`) and the browser's local timezone,
  shows a short timezone label from `Intl.DateTimeFormat("id-ID")`, and appends a
  relative description such as `(2 jam yang lalu)`.
- Keep date-only values date-only. School-need start/end dates, calendar deadlines,
  and similar `YYYY-MM-DD` values must not be shifted into another day by timezone
  conversion.
- The server and first client render show a stable UTC fallback in Indonesian; after
  mounting, the component switches to the browser timezone and refreshes the relative
  description every minute.
- Invalid values remain visible as their original text rather than throwing.
- When a line intentionally shows an exact UTC operational value, retain the raw UTC
  value in an accessible `dateTime`/`title` attribute or adjacent text while using
  `LocalTimestamp` for the readable display.
- Update explanatory copy that currently claims every displayed timestamp is UTC.

## Surfaces to migrate

- `/admin/audit` and `/outreach` audit events.
- `/admin/membership-review`, `/membership`, `/directory-profile` and
  `/directory-tags` history/confirmation times.
- `/outreach`, `/outreach/needs/:id`, `/outreach/requests/:id` and outcome summaries,
  including expiry, consent and sharing times.
- `/reference-response`, `/invitation`, `/admin/invitations`, `/email-change` and
  `/admin/email-changes` expiry notices.
- Any future workflow page that renders a UTC instant.

The school-need detail page is already migrated: closure time, revision creation
times and approval times use `LocalTimestamp`. Date-only Waktu pelaksanaan values are
unchanged.

## Acceptance

- No workflow page renders a raw ISO timestamp or a hard-coded `(UTC)` label as its
  primary readable time.
- Every converted timestamp shows browser-local time, a timezone label, and a
  Bahasa Indonesia relative description.
- Date-only values remain date-only.
- Existing UTC storage, expiry and authorization behavior is unchanged.
- Focused browser coverage uses a fixed non-UTC browser timezone and asserts the
  local label and relative text. Full tests, typecheck, lint and formatting pass.
