# Branded transactional email presentation

Date: 2026-10-26. Status: specified for implementation. Tracked as
[issue #41](https://github.com/akbarsahata/alumni-platform/issues/41). Testing seam:
the existing real local Worker/D1/Better Auth captured-mail path and loopback Resend
mock; no live email is required.

## Problem Statement

Every transactional email currently sends only a plain-text body. The copy is
complete and readable, but long messages arrive as dense paragraphs with no visual
hierarchy. Codes, deadlines, actions, and security notes are difficult to scan, and
the mail does not resemble the alumni platform. The Resend adapter accepts only
`text`, so there is no shared presentation layer to improve consistently.

This weakens trust in login, identity-verification, membership, invitation, and
outreach mail. It also makes future notification additions likely to repeat the same
unstructured format.

## Solution

Deliver every existing transactional email as a branded multipart message: the
complete current plain-text body plus a responsive HTML version generated from the
same data. Introduce one shared email presentation layer and typed message content so
plain text and HTML cannot drift.

Preserve recipients, subject lines, links, tokens, deadlines, authorization,
idempotency, delivery state, and every existing privacy rule. This is a presentation
change, not a new notification workflow.

## Inventory

| Surface                      | Current sender                              | Required presentation                                                                                                            |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Login code                   | `app/auth/auth.server.ts`                   | Prominent six-digit code block, five-minute expiry, sign-in instruction, do-not-share warning                                    |
| Membership notifications     | `app/membership/notifications.server.ts`    | Status heading for submitted, approved, rejected, or action-required, the existing message, and a `/membership` action           |
| Reference request            | `app/membership/references.server.ts`       | Sign-in instruction, seven-day expiry note, and a `/references/:id` action                                                       |
| Representative invitation    | `app/authorization/invitations.server.ts`   | Role, representative name, expiry, no-alumni-application note, and an `/invitations/:id` action                                  |
| Email-change verification    | `app/authorization/email-changes.server.ts` | Prominent verification code, expiry, current-email sign-in instruction, do-not-share warning, and an `/email-changes/:id` action |
| Outreach request or reminder | `app/outreach/outreach.server.ts`           | Need title, response deadline, `/outreach/requests/:id` action, and the interest-does-not-share-email notice                     |
| Clarification notification   | `app/outreach/outreach.server.ts`           | `/outreach/requests/:id` action with no clarification text, account email, need details, or names                                |
| Consented introduction       | `app/outreach/introduction-delivery.ts`     | Staff greeting, member name and consented email, need title, purpose, requested help, consent note, and a direct contact action  |

Membership has one sender with four subject/message variants. The other seven rows
are separate send sites: eight sender surfaces in total.

## User Stories

1. As an email recipient, I want to recognize the alumni platform immediately, so that I can trust a transactional message.
2. As a recipient, I want a clear heading and short hierarchy, so that I can understand why the email arrived without reading dense text.
3. As a recipient, I want the next action or link to stand out, so that I can continue the workflow quickly.
4. As a recipient, I want codes and deadlines to be visually distinct, so that I can copy the right value and act before expiry.
5. As a recipient, I want security and privacy notices to be noticeable, so that I know when a code or link must not be shared.
6. As a recipient, I want a plain-text alternative, so that the message remains complete when HTML is unavailable or unwanted.
7. As a recipient, I want the message to work on a phone screen, so that text and actions do not require horizontal scrolling.
8. As a screen-reader user, I want meaningful headings, links, and reading order, so that the HTML version is understandable without relying on visual layout.
9. As a privacy-conscious recipient, I want no tracking pixels or remote assets, so that opening the email does not create additional disclosure.
10. As an alumnus, I want the same recipients and disclosure rules as today, so that improved presentation never widens who receives private information.
11. As a developer, I want one typed presentation API, so that every sender can add HTML without duplicating layout markup.
12. As a developer, I want the plain text and HTML to be generated from the same content, so that links, codes, and notices cannot diverge.
13. As a developer, I want existing captured-mail tests to keep reading text, so that the current workflow assertions remain meaningful.
14. As a local operator, I want the captured mailbox to expose the HTML version, so that I can inspect presentation without sending live email.

## Implementation Decisions

### Message contract and delivery

- Extend `EmailMessage`, `ResendMessage`, and `IntroductionEmailMessage` with an
  optional `html?: string`. `text` remains required and authoritative as the
  accessible fallback.
- `sendWithResend` includes `html` in the provider payload only when it is nonempty.
  It keeps `text`, `reply_to`, timeout, sanitized errors, and the existing
  `Idempotency-Key` behavior unchanged.
- Add one shared presentation module under `app/email/` and use it from all eight
  sender surfaces. Call sites provide structured content, not raw HTML, to
  `sendEmail`.
- The structured content should cover, where applicable: preview text, heading,
  introductory paragraphs, label/value facts, a code block, an action link, a
  privacy or security notice, and a short sign-off.
- Generate both `text` and `html` from that content. The text version must retain
  every code, token, URL, deadline, and required notice. Existing tests that read
  `mail.text` must continue to pass without weakening their assertions.
- Keep subject lines, recipients, route links, expiry calculations, UTC bases,
  authorization, idempotency keys, and delivery state unchanged.
- Do not add a schema migration. The local KV mailbox and local D1 introduction
  capture already store the serialized message.
- No new runtime dependency or email build step is expected. A small typed
  TypeScript renderer is sufficient and keeps Worker size and build complexity down.

### Layout and visual language

- Use a light, centered card layout capped at 600px, with a full-bleed cream
  background and a warm off-white card. Reflect the product palette from
  `app/app.css`: cream `#f7f5ef`, card `#fffefa`, ink `#183b45`, teal `#073e50`,
  gold `#dcae48`, red `#a9222a`, and border `#e3e5df`.
- Use a red top accent and a text wordmark matching the site: a small
  `KELUARGA ALUMNI` kicker above `SMAN Sumatera Selatan`. Do not require a remote
  logo image; the message must look complete with images blocked.
- Use Georgia or a comparable serif fallback for headings and a system sans-serif
  stack for body copy. Avoid remote font requests.
- Structure the message as hidden preview text, brand header, heading, introductory
  copy, details, code block, notice, primary action, fallback URL, and footer.
- Use table-based layout with inline CSS, no JavaScript, no external stylesheet, no
  remote images, no tracking pixels, and no client-specific hacks that hide content.
  The HTML should remain comfortably below common clipping limits.
- Primary actions use a teal, high-contrast, table-based button linked to the same
  destination shown in the fallback URL. Links remain visibly underlined. Long URLs
  wrap instead of widening the card.
- The layout is single-column and responsive: full-width card on narrow screens,
  generous side padding, stacked facts, and a full-width action. There must be no
  horizontal overflow at 320px.
- Use `lang="id"`, a light color scheme declaration, semantic headings and
  paragraphs, and presentational roles on layout tables. Do not use layout tables to
  convey content structure. Aim for WCAG AA text contrast.
- Dark-mode pixel perfection is not required. Explicit light backgrounds and text
  colors must remain legible if a client applies its own dark-mode treatment.

### Content, escaping, and privacy

- Escape every interpolated HTML value, including names, need titles, purposes,
  requested help, membership messages, and representative names. Preserve line
  breaks without accepting raw HTML from callers.
- Build action URLs from `BETTER_AUTH_URL` plus fixed application routes. Do not
  accept a caller-supplied arbitrary destination. Encode `mailto:` recipients.
- Never place a login code, verification token, clarification text, private reason,
  account email, or other sensitive value in the preview text, header, footer, or
  subject. Codes remain visible only in the intended body block.
- Keep the current disclosure boundary exactly: clarification mail still omits
  message text and account emails; introduction mail includes only the member name
  and email already consented for sharing; outreach mail still does not expose a
  recipient's email to school staff.
- Use Bahasa Indonesia action labels and notices. Do not rewrite product copy beyond
  the minimum labels needed for the structured presentation.
- Footer content should identify SMAN Sumatera Selatan and explain that this is a
  transactional message from the alumni platform. Do not add marketing copy,
  unsubscribe controls, or preference links that do not exist in the product.

### Local development and documentation

- `/__local/mail` returns the optional `html` alongside `to`, `subject`, and `text`.
  Mailbox authentication and local-only restrictions remain unchanged.
- `npm run mail` may continue printing the subject and text summary. Operators can
  read the HTML field through the documented local HTTP mailbox when they need a
  visual check.
- Update `docs/local-development.md` for the `html` response field and update the
  documentation index in `docs/README.md`. Update the email paragraph in
  `docs/architecture.md` to describe multipart delivery and the plain-text fallback.
- Record the implementation and exact verification evidence in `docs/handoff.md`
  when the change is delivered.

## Testing Decisions

- Add renderer unit tests, either in `tests/email-delivery.test.mjs` or a focused
  `tests/email-presentation.test.mjs` registered in `scripts/test.mjs` and the
  `test:unit` script.
- Cover HTML escaping for `&`, `<`, `>`, `"`, and `'`, line-break preservation,
  hidden preview text, heading and fact rendering, code-block rendering, notice
  rendering, action hrefs, and visible fallback URLs.
- Assert text/HTML parity for codes, URLs, deadlines, and required notices. Assert
  that preview text never contains a code or token.
- Assert that the output contains no remote images, tracking pixels, external
  stylesheets, scripts, or remote fonts.
- Extend adapter tests so a provided `html` value reaches the Resend payload and an
  absent `html` value is omitted. Keep the existing text-only and idempotency
  behavior covered.
- Extend captured-mail checks so each sender surface produces HTML and its text
  fallback still contains the current actionable content. Use the local mailbox for
  local capture and the loopback Resend mock for provider-path checks.
- Reassert the existing privacy exclusions against both representations where they
  apply: clarification mail must not contain the message text or account email, and
  introduction mail must not gain recipients or member details beyond the current
  consent.
- Visually inspect representative HTML at desktop and 320px widths in a browser.
  Do not commit generated preview artifacts or screenshots.
- Run the focused email tests, all integration contexts, the full `npm test` suite,
  `npm run typecheck`, `npm run build`, `npm run lint`, and `npm run format:check`.
  No live Resend request or deployment is part of this work.

## Acceptance Criteria

- All eight sender surfaces produce a complete text part and a branded HTML part from
  the same content.
- Every code, token, URL, deadline, and required notice appears in both parts, with
  subjects and recipients unchanged.
- The HTML layout is recognizable, readable, responsive down to 320px, accessible,
  and complete with images and remote fonts blocked.
- Dynamic values are escaped; no caller can inject raw HTML; preview text contains no
  sensitive value.
- Clarification and introduction disclosure boundaries are unchanged and verified in
  both representations.
- The Resend adapter sends `html` when present, omits it when absent, and preserves
  idempotency and sanitized failure behavior.
- The local mailbox exposes HTML without weakening its local-only authentication.
- No database migration, new runtime dependency, new notification, or delivery
  behavior change is introduced.
- Documentation is updated, and the focused and full verification commands pass.

## Out of Scope

New email types; marketing, digest, or preference mail; subject-line rewrites;
product-copy rewriting; localization beyond Bahasa Indonesia; sender-domain or
display-name configuration; attachments; embedded or remote images; a template
editor; scheduled retries, outbox changes, Resend webhooks, or delivery analytics;
pixel-perfect dark mode; live Resend sends; staging or production deployment.

## Further Notes

- The current checkout has no HTML email support and no shared email presentation
  helper. The Resend adapter sends `text` only.
- A GitHub issue search found no existing email-presentation improvement. This scope
  is separate from notification behavior changes such as #30.
- No glossary or ADR directory exists in the inspected checkout. Use the established
  terms **transactional email**, **local mailbox**, **captured mail**, and **Resend
  adapter**.
- The implementation issue should be flat and carry `enhancement` and
  `ready-for-agent`, with no parent specification issue or subticket numbering.
