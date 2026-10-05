# Remote D1 seeding

The [Seed D1 workflow](../.github/workflows/seed.yml) runs on branch pushes that change
[seeds/seed.sql](../seeds/seed.sql), its runner, or the workflow itself. `master` selects
the GitHub `production` environment; every other branch selects `default`. These must
use separate remote D1 databases. Protect `master` and restrict the production GitHub
environment to that branch before enabling writes.

`SEEDING_ENABLED: "false"` in the workflow currently disables database writes. The job
still checks out the commit, validates the seed file and branch selection, and records
the selected environment and skipped writes in the run summary. No Cloudflare secrets
are required while disabled. This workflow does not deploy the application.

Before changing the flag to `"true"`:

1. Create the remote databases and apply the existing migrations to each through a
   separate operator process. Seeding does not apply migrations.
2. Configure these GitHub environment secrets separately for `production` and `default`:
   `CLOUDFLARE_API_TOKEN` (D1 edit permission), `CLOUDFLARE_ACCOUNT_ID`, and `D1_DATABASE_ID`.
3. Replace the initial `SELECT 1` with reviewed SQL. Use repeat-safe statements: retries
   and later pushes execute the whole file again. All non-master branches share the
   default database; runs are serialized per environment and are not cancelled in progress.
4. Review and enable the flag, then push a seed change. Workflow changes also trigger
   a run, so enabling the flag executes the current seed.

The runner uses an isolated temporary Wrangler configuration built from the selected
environment secrets and always executes against remote D1. It does not use the local
database binding or copy local data. See Cloudflare's
[D1 execute documentation](https://developers.cloudflare.com/d1/wrangler-commands/#d1-execute).

## Administrator appointment

Do not seed authentication sessions, OTPs, or falsely verified accounts. Production
email delivery must first be configured so the appointed administrator can sign in and
verify their email. Then obtain the account ID and use a reviewed insertion into
`organization_bootstrap`, following the fields and identity checks in the
[administrator bootstrap guide](administrator-bootstrap.md). Existing database triggers
validate the account and create membership/audit records atomically.

Make that insertion conditional on the singleton appointment being absent, and check
that any existing appointment matches the intended administrator before proceeding.
Never overwrite/delete an existing appointment to make a rerun succeed. No actual
administrator appointment or account data is committed in the seed file yet.
