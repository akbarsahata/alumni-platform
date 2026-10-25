# Remote D1 seeding

The [Seed D1 workflow](../.github/workflows/seed.yml) runs only from two deliberate
events:

- A push to `master` that changes [seeds/seed.sql](../seeds/seed.sql), its runner, or
  the workflow itself. It selects the GitHub `staging` environment and the staging D1
  database.
- A published GitHub Release whose tag matches `v*` and is not a prerelease. It
  selects the `production` environment and the production D1 database.

Feature branches, pull requests, merge queues, prereleases and raw tag pushes cannot
select a seed target. The runner repeats the same event/tag checks before writing.

`SEEDING_ENABLED: "false"` in the workflow currently disables database writes. A
validation job still checks out the commit, validates the seed file and target
selection, and records the selected environment and skipped writes in the run summary.
The write job and its environment secrets exist only after the flag is enabled. No
Cloudflare secrets are required while disabled. This workflow does not deploy the
application and does not apply migrations.

Before changing the flag to `"true"`:

1. Create the remote databases and apply the committed migrations to each through the
   deployment workflow or a separate reviewed operator process. An enabled seed run
   must not be the first thing to touch an unmigrated database.
2. Configure these GitHub environment secrets separately for `staging` and
   `production`: `CLOUDFLARE_API_TOKEN` (D1 edit permission),
   `CLOUDFLARE_ACCOUNT_ID`, and `D1_DATABASE_ID`.
3. Protect the `production` environment with required reviewers and any tag rules.
   The production database ID must never be stored in the `staging` environment.
4. Replace the initial `SELECT 1` with reviewed, repeat-safe SQL. Retries and later
   runs execute the whole file again.
5. Enable the flag only after the deployment path, migrations and a dry review are
   proven. A workflow change or seed change triggers the next run.

The runner uses an isolated temporary Wrangler configuration built from the selected
environment secret and always executes against remote D1. It does not use the local
database binding or copy local data. See Cloudflare's
[D1 execute documentation](https://developers.cloudflare.com/d1/wrangler-commands/#d1-execute).

## Administrator appointment

Do not seed authentication sessions, OTPs, or falsely verified accounts. Live email
delivery must first be configured so the appointed administrator can sign in and
verify their email. Then obtain the account ID and use a reviewed insertion into
`organization_bootstrap`, following the fields and identity checks in the
[administrator bootstrap guide](administrator-bootstrap.md#remote-appointment). Existing
database triggers validate the account and create membership/audit records atomically.

Before inserting, check that the singleton appointment is absent and that any existing
appointment matches the intended administrator. Never overwrite or delete an existing
appointment to make a rerun succeed. No actual administrator appointment or account
data is committed in the seed file.
