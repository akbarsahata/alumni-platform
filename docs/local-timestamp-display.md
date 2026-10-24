# Local timestamp display

Status: `LocalTimestamp` is applied to every workflow surface listed below.
[#31](https://github.com/akbarsahata/alumni-platform/issues/31) delivered the
system-wide rollout.

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
- The accessible `dateTime` and `title` attributes retain the exact underlying UTC
  instant for operators who need it.
- Update explanatory copy that currently claims every displayed timestamp is UTC.

## Migrated surfaces

- `/admin/audit` and `/admin/outreach-audit` audit events, including their
  explanatory copy.
- `/admin/membership-review`, `/membership`, `/profile`, `/directory/:userId` and
  `/directory/tags` history/confirmation times.
- `/outreach`, `/outreach/needs/:needId`, `/outreach/requests/:requestId` and the
  shared outcome summary, including expiry, consent, sharing, closure and outcome
  history times.
- `/reference-response`, `/invitation`, `/admin/invitations`, `/email-change` and
  `/admin/email-changes` expiry notices.
- `/school-needs/:needId` closure, revision and approval times.

Date-only Waktu pelaksanaan values on the school-need and outreach pages remain
unchanged. Server-side email bodies are not browser surfaces; they continue to state
their UTC expiry explicitly.

## Acceptance

- No workflow page renders a raw ISO timestamp or a hard-coded `(UTC)` label as its
  primary readable time.
- Every converted timestamp shows browser-local time, a timezone label, and a
  Bahasa Indonesia relative description.
- Date-only values remain date-only.
- Existing UTC storage, expiry and authorization behavior is unchanged.
- Focused browser coverage uses a fixed non-UTC browser timezone and asserts the
  local label and relative text. Full tests, typecheck, lint and formatting pass.
