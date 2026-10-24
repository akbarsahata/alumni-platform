# Profile deletion and manual retention runbook

This is the operator procedure for issue #20. It applies the migration
`0024_profile_deletion_retention.sql`. Nothing here runs on a schedule: elapsed
time identifies candidates, but a primary administrator must record a retention
execution and perform every deletion explicitly.

Product deletion requests are handled in `/admin/profile-deletions`. This runbook
covers ordinary 90-day clarification retention, 12-month outreach retention, and
the 12-month profile-deletion evidence hold. It does not delete accounts,
membership, roles, financial records, or shared-email evidence before its hold
ends.

## Boundaries

- The acting account must be the bootstrap primary administrator. The database
  validates that authority when an execution row is inserted.
- Use the local D1 operator boundary only. No remote migration, scheduled job,
  background cleanup, or live email is part of this procedure.
- Back up/export the local database before a retention run.
- The candidate views are read-only. They never delete records.
- General audits must not receive email addresses, profile content, clarification
  text, need details, or outcome notes. The deletion/evidence tables store only
  actor IDs, actions, counts, UTC times, and the completion evidence required by
  the product.

## 1. Export and review

For ordinary local D1:

```sh
npx wrangler d1 export alumni_local --local --output "backup-before-retention-$(date +%Y%m%dT%H%M%SZ).sql"
```

For the disposable verification state, add
`--persist-to "$ALUMNI_TEST_STATE"` to every `wrangler d1 execute` command below.

Review all candidates:

```sql
SELECT * FROM retention_clarification_candidate ORDER BY eligible_at, request_id;
SELECT * FROM retention_closed_need_candidate ORDER BY eligible_at, need_id;
SELECT * FROM retention_profile_deletion_hold
 ORDER BY status, hold_until, deletion_request_id;
```

`retention_clarification_candidate.ended_at` is the earliest applicable end:
declined response, cancelled response, expiry, or need closure. The view includes
only requests with at least one message whose end is at least 90 days old.

`retention_closed_need_candidate` includes needs closed at least 12 months ago.
`retention_profile_deletion_hold` includes active deletion requests and completed
deletion requests still inside the 12-month consent/sharing hold.

Do not proceed for a need while any related member appears in the hold view. The
database delete guards reject outcome, introduction, and request deletion during
an active or unexpired hold.

## 2. Preserve aggregate school-need metrics

Create the aggregate-only snapshot before deleting individual outreach records.
The snapshot contains counts only; it has no member IDs, names, emails, notes,
request IDs, or individual timestamps.

```sql
INSERT INTO school_need_retention_snapshot
 (id,need_id,category,request_count,pending_count,interested_count,declined_count,
  cancelled_count,introduced_count,help_confirmed_count,completed_count,
  did_not_proceed_count,shared_count,captured_at)
SELECT lower(hex(randomblob(16))),need_id,category,request_count,pending_count,
 interested_count,declined_count,cancelled_count,introduced_count,
 help_confirmed_count,completed_count,did_not_proceed_count,shared_count,
 strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM retention_closed_need_candidate
WHERE need_id='<needId>';
```

Verify exactly one snapshot exists before deleting anything:

```sql
SELECT * FROM school_need_retention_snapshot WHERE need_id='<needId>';
```

## 3. Record execution evidence

Every ordinary deletion needs a matching `retention_execution`. The trigger
rejects non-primary actors.

```sql
INSERT INTO retention_execution
 (id,actor_user_id,scope,target_id,reason,executed_at)
SELECT lower(hex(randomblob(16))),b.primary_user_id,'outreach-records','<needId>',
 '<review evidence and reason>',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM organization_bootstrap b;
```

Use scope `clarification-text` with the request ID for the 90-day clarification
step. Use scope `profile-deletion-evidence` with the deletion request ID for the
12-month deletion-evidence step. Set `completed_at` after verification:

```sql
UPDATE retention_execution
SET completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id='<executionId>';
```

## 4. Delete clarification text after 90 days

For each candidate request:

```sql
INSERT INTO retention_execution
 (id,actor_user_id,scope,target_id,reason,executed_at)
SELECT lower(hex(randomblob(16))),b.primary_user_id,'clarification-text','<requestId>',
 '<review evidence and reason>',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM organization_bootstrap b;

DELETE FROM outreach_clarification WHERE request_id='<requestId>';
```

The delete guard permits this only when the candidate view includes the request or
the member has an active profile-deletion request. The latter exception is used by
the product processing screen, not by this ordinary procedure.

## 5. Delete closed-need outreach records after 12 months

Delete in dependency order. The execution scope must target the need ID and the
aggregate snapshot must already exist:

```sql
DELETE FROM local_introduction_mail
WHERE introduction_id IN (
 SELECT i.id FROM outreach_introduction i
 JOIN outreach_request r ON r.id=i.request_id
 WHERE r.need_id='<needId>');

DELETE FROM outreach_outcome_event
WHERE request_id IN (SELECT id FROM outreach_request WHERE need_id='<needId>');

DELETE FROM outreach_outcome
WHERE request_id IN (SELECT id FROM outreach_request WHERE need_id='<needId>');

DELETE FROM outreach_introduction
WHERE request_id IN (SELECT id FROM outreach_request WHERE need_id='<needId>');

DELETE FROM outreach_clarification
WHERE request_id IN (SELECT id FROM outreach_request WHERE need_id='<needId>');

DELETE FROM outreach_notification
WHERE request_id IN (SELECT id FROM outreach_request WHERE need_id='<needId>');

DELETE FROM outreach_request WHERE need_id='<needId>';
```

`outreach_audit` is minimal history (IDs, action, UTC time) and remains available.
The need, its approvals, revisions, staff recipient, and recipient account and
membership records remain. A need with an active or unexpired profile-deletion
hold cannot have its outcome, introduction, or request rows deleted.

## 6. Delete profile-deletion evidence after its 12-month hold

Profile-deletion requests and their append-only events are retained for 12 months
after completion. After the hold:

```sql
INSERT INTO retention_execution
 (id,actor_user_id,scope,target_id,reason,executed_at)
SELECT lower(hex(randomblob(16))),b.primary_user_id,'profile-deletion-evidence',
 '<deletionRequestId>','<review evidence and reason>',
 strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM organization_bootstrap b;

DELETE FROM profile_deletion_event WHERE request_id='<deletionRequestId>';
DELETE FROM profile_deletion_request WHERE id='<deletionRequestId>';
```

Before then, the database rejects deletion even with an execution row. Active
requests cannot be deleted through this procedure.

## 7. Verify

```sql
SELECT COUNT(*) FROM outreach_request WHERE need_id='<needId>';
SELECT COUNT(*) FROM outreach_outcome WHERE request_id IN
 (SELECT id FROM outreach_request WHERE need_id='<needId>');
SELECT COUNT(*) FROM outreach_introduction WHERE request_id IN
 (SELECT id FROM outreach_request WHERE need_id='<needId>');
SELECT COUNT(*) FROM outreach_clarification WHERE request_id='<requestId>';

SELECT * FROM school_need_retention_snapshot WHERE need_id='<needId>';
SELECT * FROM retention_profile_deletion_hold;
SELECT id,actor_user_id,action,occurred_at FROM outreach_audit
WHERE need_id='<needId>' ORDER BY occurred_at;
```

Expected: individual request, outcome, introduction, and clarification rows are
gone; the aggregate snapshot remains; completion evidence and execution rows
remain; no audit row contains email, profile text, clarification text, or notes.
If any guard aborts, stop and record the reason rather than disabling a trigger.
