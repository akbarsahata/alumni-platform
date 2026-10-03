# Project instructions

Read docs/pilot.md, docs/architecture.md, docs/tickets.md, and docs/handoff.md before implementation. Preserve user decisions; distinguish accepted requirements from proposed implementation choices.

- Use Cloudflare-compatible components and Resend for email. This project does not use Sites hosting.
- Build one ticket at a time in dependency order. Record completed work, checks, limitations, and the next step in docs/handoff.md.
- Default product language: Bahasa Indonesia (proposed). Store money as integer rupiah and format it as IDR. Store timestamps in UTC; do not assume the Indonesian school's timezone.
- Enforce authorization on the server, including each record and file download. A verified email does not imply approved alumni membership.
- Student representatives have no private alumni directory or payment-evidence access. Separate staff access from directory-coordinator access.
- Use maintained authentication components; do not invent authentication cryptography. Verify runtime and adapter compatibility before committing to a library.
- Never commit credentials, contact records, bank statements, or real payment evidence. Use synthetic fixtures and local email capture during development.
- Confirmed receipts alone affect funding totals. Financial corrections must preserve an audit trail.
- Test consequential behavior: access denial, token reuse, workflow transitions, duplicate confirmations, and email retry behavior. Run appropriate build/type checks.
- Keep scope focused: no social feed, public comments, chat, leaderboards, payment gateway, or alumni-record import in the pilot.
