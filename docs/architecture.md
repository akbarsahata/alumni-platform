# Architecture and data model

## Stack proposal

The user selected Cloudflare and Resend. Specific libraries below are recommendations pending ticket 0 validation, not installed or verified dependencies.

| Component          | Choice                                                       | Purpose                                                               |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Application        | TypeScript, React Router framework mode, Cloudflare Workers  | One full-stack application with server-enforced workflows             |
| Database           | Cloudflare D1                                                | Relational member, initiative, and financial records                  |
| Queries/migrations | Drizzle ORM with its D1 adapter                              | Typed queries and versioned migrations                                |
| File storage       | Private Cloudflare R2 bucket                                 | Payment evidence and permitted initiative assets                      |
| Email              | Existing Resend account                                      | Verification, references, opportunity requests, updates               |
| Authentication     | Candidate: Better Auth with supported D1/Drizzle integration | Email-based sign-in and session management; validate before selection |
| Abuse controls     | Server rate limits; Turnstile for exposed forms as needed    | Reduce registration and email abuse                                   |
| Background work    | D1 outbox plus scheduled Worker processing                   | Reliable email retries without a separate application server          |

D1 is SQLite-based, replacing the earlier provisional PostgreSQL recommendation. It fits the anticipated pilot's relational requirements without another database provider. Reassess limits and query patterns against measured community usage before expansion. Do not assume PostgreSQL features or arbitrary multi-statement transaction APIs; verify D1 batch atomicity and adapter behavior for the chosen workflows.

## Authentication and permissions

Email ownership, account status, and alumni membership are separate concepts. A school representative may have an active account without alumni membership. Membership approval never grants administration rights.

Use a maintained auth library and secure cookie sessions. Verify token expiry, single use, email-scanner handling, CSRF/origin checks, sign-out, revocation, and protection against account enumeration. Ticket 1 uses Better Auth email-code login for all accounts, including administrators. Administrator MFA is deferred to a later improvement by the agreed Ticket 1 scope. If the candidate library cannot meet Workers requirements, document and select a supported replacement before ticket 1.

Authorization combines role, ownership, and workflow state. Finance can review payment evidence; directory coordinators can discover willing alumni; staff can review school content. Do not give these permissions to every administrator or school user implicitly. Keep a permission matrix in code and test denials.

## Conceptual tables

| Group              | Entities and relationships                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Auth-managed users/sessions/tokens; users have role assignments; optional alumni profiles belong to users                                                     |
| Verification       | Membership applications belong to users/cohorts; reference requests link applicants to endorsers; reviews retain decisions and timestamps                     |
| Directory          | Profiles link to expertise tags, availability, visibility/contact settings; outreach requests link coordinators, members, and optional initiatives            |
| Initiatives        | Initiatives have owners, requested support, budgets and lifecycle status; approvals and updates retain authors/reviewers; follows link members to initiatives |
| Receiving accounts | Versioned receiving-account records belong to initiatives; transfer claims retain the account version shown at submission                                     |
| Finance            | Claims and optional evidence link to receipts after reconciliation; receipt corrections, expenses, refunds and adjustments retain actor/reason/history        |
| Operations         | Audit events; email outbox/delivery attempts; notification preferences; attachments with ownership/access metadata                                            |

Use stable IDs, foreign keys, uniqueness constraints and timestamps. Store whole rupiah in integer fields, with explicit currency and bounds. Define whether funding progress is net of refunds and show gross receipts/refunds separately in reports. Never derive money received from claims. Validate lifecycle transitions on the server.

## Files and email

R2 is private by default. Serve payment evidence only through authenticated, authorized access; use unguessable object keys, size/type limits, and safe download headers. Store file metadata in D1, never private file URLs in public initiative responses.

Use an outbox to separate committed workflow changes from email delivery. Persist a stable idempotency key, retry state and provider message ID; prevent ordinary retries from sending duplicate messages. Reconcile ambiguous delivery outcomes within the provider's documented idempotency guarantees. If webhooks are added, verify signatures and deduplicate events. Honor opt-outs for optional updates and suppress bounced destinations.

Resend has a verified domain according to the user, but this workspace has no configured credential. Use a stub locally; no live messages during development. Store production credentials as Worker secrets. Distinguish transactional mail from digests and confirm the sender/reply-to addresses before deployment.

## Environments and recovery

Local development uses Wrangler-backed local bindings and synthetic data. Staging and production have separate databases, buckets, secrets, and email settings. Use the organization's Cloudflare account and domain for production.

Before live use, document D1 recovery/export and R2 recovery arrangements, verify current provider retention limits, and perform a restore exercise. Define retention/deletion for profiles, rejected applications, payment evidence and audit records; preserve only justified financial records after account deletion. Scrub private data and tokens from logs.

## Ticket 0 compatibility gate

Pin versions only after a minimal Worker build and local request succeed, a D1 migration/query works, and the auth adapter can create/revoke a session in the Workers runtime. Record actual commands and results. Documentation planning alone is not evidence of runtime compatibility.
