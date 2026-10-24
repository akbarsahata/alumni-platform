-- Directory-profile deletion is distinct from account or membership deletion.
-- Requests open a restricted primary-administrator manual workflow. The event
-- table is the append-only evidence; request columns are derived from events.
CREATE TABLE profile_deletion_request (
 id TEXT PRIMARY KEY,
 member_user_id TEXT NOT NULL REFERENCES user(id),
 requested_at TEXT NOT NULL,
 due_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','completed')),
 profile_removed_at TEXT,
 profile_removed_by TEXT REFERENCES user(id),
 profile_removal_count INTEGER CHECK(profile_removal_count BETWEEN 0 AND 1),
 clarification_removed_at TEXT,
 clarification_removed_by TEXT REFERENCES user(id),
 clarification_removal_count INTEGER CHECK(clarification_removal_count >= 0),
 completed_at TEXT,
 completed_by TEXT REFERENCES user(id),
 completion_note TEXT CHECK(completion_note IS NULL OR (
  length(trim(completion_note)) BETWEEN 1 AND 1000 AND completion_note=trim(completion_note)
 )),
 CHECK(due_at > requested_at),
 CHECK(
  (status='active' AND completed_at IS NULL AND completed_by IS NULL AND completion_note IS NULL)
  OR (status='completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL
    AND completion_note IS NOT NULL AND profile_removed_at IS NOT NULL
    AND clarification_removed_at IS NOT NULL)
 )
);
CREATE INDEX profile_deletion_request_due ON profile_deletion_request(status,due_at);
CREATE INDEX profile_deletion_request_member ON profile_deletion_request(member_user_id,requested_at);
CREATE UNIQUE INDEX profile_deletion_request_one_active
 ON profile_deletion_request(member_user_id) WHERE status='active';

CREATE TABLE profile_deletion_event (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES profile_deletion_request(id),
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 action TEXT NOT NULL CHECK(action IN('requested','profile-removed','clarification-removed','completed')),
 count INTEGER CHECK(count IS NULL OR count >= 0),
 note TEXT CHECK(note IS NULL OR length(trim(note)) BETWEEN 1 AND 1000),
 occurred_at TEXT NOT NULL
);
CREATE INDEX profile_deletion_event_history ON profile_deletion_event(request_id,occurred_at,id);

-- Manual ordinary-retention evidence. No application route creates these rows;
-- the documented operator SQL must record the acting primary and the scope.
CREATE TABLE retention_execution (
 id TEXT PRIMARY KEY,
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 scope TEXT NOT NULL CHECK(scope IN('clarification-text','outreach-records','profile-deletion-evidence')),
 target_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 executed_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX retention_execution_target ON retention_execution(scope,target_id);

-- Aggregate-only preservation before individual outreach records are removed.
-- It deliberately stores no member ids, emails, notes, request ids or timestamps.
CREATE TABLE school_need_retention_snapshot (
 id TEXT PRIMARY KEY,
 need_id TEXT NOT NULL REFERENCES school_need(id),
 category TEXT NOT NULL,
 request_count INTEGER NOT NULL,
 pending_count INTEGER NOT NULL,
 interested_count INTEGER NOT NULL,
 declined_count INTEGER NOT NULL,
 cancelled_count INTEGER NOT NULL,
 introduced_count INTEGER NOT NULL,
 help_confirmed_count INTEGER NOT NULL,
 completed_count INTEGER NOT NULL,
 did_not_proceed_count INTEGER NOT NULL,
 shared_count INTEGER NOT NULL,
 captured_at TEXT NOT NULL
);

CREATE TRIGGER retention_execution_validate BEFORE INSERT ON retention_execution BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM organization_bootstrap b JOIN user u ON u.id=b.primary_user_id
  WHERE b.primary_user_id=NEW.actor_user_id AND u.email_verified=1)
  THEN RAISE(ABORT,'Retention execution requires the primary administrator') END;
END;

-- Deletion requests are available while membership is already restricted, so a
-- suspended member may set only the deletion marker. Other profile changes keep
-- the original approved-membership requirement.
DROP TRIGGER profile_update_authority;
CREATE TRIGGER profile_update_authority BEFORE UPDATE ON expertise_profile BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM alumni_membership WHERE user_id=NEW.user_id AND status='approved')
  AND NOT (
   OLD.deletion_requested_at IS NULL AND NEW.deletion_requested_at IS NOT NULL
   AND NEW.display_name IS OLD.display_name
   AND NEW.introduction IS OLD.introduction
   AND NEW.city IS OLD.city
   AND NEW.country IS OLD.country
   AND NEW.availability_note IS OLD.availability_note
   AND NEW.expertise_tags IS OLD.expertise_tags
   AND NEW.help_types IS OLD.help_types
   AND NEW.availability IS OLD.availability
   AND NEW.participation IS OLD.participation
   AND NEW.confirmed_at IS OLD.confirmed_at
   AND NEW.location_format IS OLD.location_format
  ) THEN RAISE(ABORT,'Profile requires approved membership') END;
END;

CREATE TRIGGER profile_deletion_blocks_insert BEFORE INSERT ON expertise_profile
WHEN EXISTS(SELECT 1 FROM profile_deletion_request WHERE member_user_id=NEW.user_id AND status='active')
BEGIN SELECT RAISE(ABORT,'Profile deletion request is active'); END;

CREATE TRIGGER profile_deletion_blocks_update BEFORE UPDATE ON expertise_profile
WHEN EXISTS(SELECT 1 FROM profile_deletion_request WHERE member_user_id=NEW.user_id AND status='active')
AND NOT (
 OLD.deletion_requested_at IS NULL AND NEW.deletion_requested_at IS NOT NULL
 AND NEW.display_name IS OLD.display_name
 AND NEW.introduction IS OLD.introduction
 AND NEW.city IS OLD.city
 AND NEW.country IS OLD.country
 AND NEW.availability_note IS OLD.availability_note
 AND NEW.expertise_tags IS OLD.expertise_tags
 AND NEW.help_types IS OLD.help_types
 AND NEW.availability IS OLD.availability
 AND NEW.participation IS OLD.participation
 AND NEW.confirmed_at IS OLD.confirmed_at
 AND NEW.location_format IS OLD.location_format
)
BEGIN SELECT RAISE(ABORT,'Profile deletion request is active'); END;

-- A request requires an existing profile and an email-verified member. The
-- partial unique index makes repeated or concurrent submissions harmless.
CREATE TRIGGER profile_deletion_request_validate BEFORE INSERT ON profile_deletion_request BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM user WHERE id=NEW.member_user_id AND email_verified=1)
  OR NOT EXISTS(SELECT 1 FROM expertise_profile WHERE user_id=NEW.member_user_id)
  OR NEW.status!='active'
  THEN RAISE(ABORT,'Profile deletion requires an existing profile') END;
END;

-- Setting the marker cancels pending outreach, queued request/reminder mail and
-- pending/claimed introductions through the existing eligibility triggers.
CREATE TRIGGER profile_deletion_request_apply AFTER INSERT ON profile_deletion_request BEGIN
 UPDATE expertise_profile SET deletion_requested_at=NEW.requested_at
 WHERE user_id=NEW.member_user_id AND deletion_requested_at IS NULL;
 INSERT INTO profile_deletion_event(id,request_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.member_user_id,'requested',NEW.requested_at);
END;

CREATE TRIGGER profile_deletion_event_validate BEFORE INSERT ON profile_deletion_event BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM profile_deletion_request WHERE id=NEW.request_id)
  THEN RAISE(ABORT,'Profile deletion request not found') END;
 SELECT CASE WHEN NEW.action='requested' AND (
  NOT EXISTS(SELECT 1 FROM profile_deletion_request r
   WHERE r.id=NEW.request_id AND r.member_user_id=NEW.actor_user_id
    AND r.requested_at=NEW.occurred_at)
  OR EXISTS(SELECT 1 FROM profile_deletion_event e WHERE e.request_id=NEW.request_id))
  THEN RAISE(ABORT,'Invalid requested event') END;
 SELECT CASE WHEN NEW.action!='requested' AND NOT EXISTS(
  SELECT 1 FROM organization_bootstrap b JOIN user u ON u.id=b.primary_user_id
  WHERE b.primary_user_id=NEW.actor_user_id AND u.email_verified=1)
  THEN RAISE(ABORT,'Only the primary administrator may process profile deletion') END;
 SELECT CASE WHEN NEW.action='profile-removed' AND (
  NOT EXISTS(SELECT 1 FROM profile_deletion_request
   WHERE id=NEW.request_id AND status='active' AND profile_removed_at IS NULL)
  OR NEW.count IS NULL OR NEW.count NOT BETWEEN 0 AND 1)
  THEN RAISE(ABORT,'Profile removal is not available') END;
 SELECT CASE WHEN NEW.action='clarification-removed' AND (
  NOT EXISTS(SELECT 1 FROM profile_deletion_request
   WHERE id=NEW.request_id AND status='active' AND clarification_removed_at IS NULL)
  OR NEW.count IS NULL OR NEW.count < 0)
  THEN RAISE(ABORT,'Clarification removal is not available') END;
 SELECT CASE WHEN NEW.action='completed' AND (
  NOT EXISTS(SELECT 1 FROM profile_deletion_request
   WHERE id=NEW.request_id AND status='active' AND profile_removed_at IS NOT NULL
    AND clarification_removed_at IS NOT NULL AND completed_at IS NULL)
  OR NEW.note IS NULL
  OR length(trim(NEW.note)) NOT BETWEEN 1 AND 1000
  OR NEW.note!=trim(NEW.note))
  THEN RAISE(ABORT,'Completion requires both removal steps and evidence') END;
END;

CREATE TRIGGER profile_deletion_event_apply AFTER INSERT ON profile_deletion_event BEGIN
 UPDATE profile_deletion_request SET
  profile_removed_at=NEW.occurred_at,profile_removed_by=NEW.actor_user_id,
  profile_removal_count=NEW.count
 WHERE NEW.action='profile-removed' AND id=NEW.request_id;

 DELETE FROM expertise_profile
 WHERE NEW.action='profile-removed'
  AND user_id=(SELECT member_user_id FROM profile_deletion_request WHERE id=NEW.request_id);

 UPDATE profile_deletion_request SET
  clarification_removed_at=NEW.occurred_at,clarification_removed_by=NEW.actor_user_id,
  clarification_removal_count=NEW.count
 WHERE NEW.action='clarification-removed' AND id=NEW.request_id;

 DELETE FROM outreach_clarification
 WHERE NEW.action='clarification-removed'
  AND request_id IN(SELECT id FROM outreach_request
   WHERE recipient_user_id=(SELECT member_user_id FROM profile_deletion_request WHERE id=NEW.request_id));

 UPDATE profile_deletion_request SET
  status='completed',completed_at=NEW.occurred_at,completed_by=NEW.actor_user_id,
  completion_note=NEW.note
 WHERE NEW.action='completed' AND id=NEW.request_id;
END;

-- Request projections are derived from appended events and cannot be edited
-- directly. The due date is fixed at request time and is never recalculated.
CREATE TRIGGER profile_deletion_request_derived_update BEFORE UPDATE ON profile_deletion_request BEGIN
 SELECT CASE WHEN NEW.id!=OLD.id OR NEW.member_user_id!=OLD.member_user_id
  OR NEW.requested_at!=OLD.requested_at OR NEW.due_at!=OLD.due_at
  THEN RAISE(ABORT,'Profile deletion lifecycle fields are derived') END;
 SELECT CASE WHEN NEW.status!=OLD.status AND NOT (
  OLD.status='active' AND NEW.status='completed' AND EXISTS(
   SELECT 1 FROM profile_deletion_event e
   WHERE e.request_id=OLD.id AND e.action='completed' AND e.occurred_at=NEW.completed_at
    AND e.actor_user_id=NEW.completed_by AND e.note=NEW.completion_note))
  THEN RAISE(ABORT,'Profile deletion completion is derived') END;
 SELECT CASE WHEN NEW.profile_removed_at IS NOT OLD.profile_removed_at AND NOT EXISTS(
  SELECT 1 FROM profile_deletion_event e
  WHERE e.request_id=OLD.id AND e.action='profile-removed'
   AND e.occurred_at=NEW.profile_removed_at AND e.actor_user_id=NEW.profile_removed_by
   AND e.count=NEW.profile_removal_count)
  THEN RAISE(ABORT,'Profile removal evidence is derived') END;
 SELECT CASE WHEN NEW.clarification_removed_at IS NOT OLD.clarification_removed_at AND NOT EXISTS(
  SELECT 1 FROM profile_deletion_event e
  WHERE e.request_id=OLD.id AND e.action='clarification-removed'
   AND e.occurred_at=NEW.clarification_removed_at AND e.actor_user_id=NEW.clarification_removed_by
   AND e.count=NEW.clarification_removal_count)
  THEN RAISE(ABORT,'Clarification removal evidence is derived') END;
END;

CREATE TRIGGER profile_deletion_event_retain_update BEFORE UPDATE ON profile_deletion_event
BEGIN SELECT RAISE(ABORT,'Profile deletion evidence must be retained'); END;

-- ---------------------------------------------------------------------------
-- Read-only retention candidates and holds. These views identify work; they
-- never delete anything.
CREATE VIEW retention_clarification_candidate AS
SELECT request_id,need_id,message_count,ended_at,
 datetime(ended_at,'+90 days') AS eligible_at
FROM (
 SELECT r.id AS request_id,r.need_id,COUNT(c.id) AS message_count,
  min(
   COALESCE(CASE WHEN r.status='declined' THEN COALESCE(r.responded_at,r.updated_at) END,
     '9999-12-31T23:59:59.999Z'),
   COALESCE(CASE WHEN r.status='cancelled' THEN r.updated_at END,
     '9999-12-31T23:59:59.999Z'),
   COALESCE(CASE WHEN julianday(r.expires_at)<=julianday('now') THEN r.expires_at END,
     '9999-12-31T23:59:59.999Z'),
   COALESCE(x.closed_at,'9999-12-31T23:59:59.999Z')) AS ended_at
 FROM outreach_request r
 LEFT JOIN outreach_closure x ON x.need_id=r.need_id
 LEFT JOIN outreach_clarification c ON c.request_id=r.id
 GROUP BY r.id
)
WHERE ended_at IS NOT NULL AND julianday(ended_at)<=julianday('now','-90 days')
 AND message_count>0;

CREATE VIEW retention_closed_need_candidate AS
SELECT n.id AS need_id,n.category,x.closed_at,
 datetime(x.closed_at,'+12 months') AS eligible_at,
 (SELECT COUNT(*) FROM outreach_request r WHERE r.need_id=n.id) AS request_count,
 (SELECT COUNT(*) FROM outreach_request r WHERE r.need_id=n.id AND r.status='pending') AS pending_count,
 (SELECT COUNT(*) FROM outreach_request r WHERE r.need_id=n.id AND r.status='interested') AS interested_count,
 (SELECT COUNT(*) FROM outreach_request r WHERE r.need_id=n.id AND r.status='declined') AS declined_count,
 (SELECT COUNT(*) FROM outreach_request r WHERE r.need_id=n.id AND r.status='cancelled') AS cancelled_count,
 (SELECT COUNT(*) FROM outreach_outcome o JOIN outreach_request r ON r.id=o.request_id
   WHERE r.need_id=n.id AND o.state='introduced') AS introduced_count,
 (SELECT COUNT(*) FROM outreach_outcome o JOIN outreach_request r ON r.id=o.request_id
   WHERE r.need_id=n.id AND o.state='help-confirmed') AS help_confirmed_count,
 (SELECT COUNT(*) FROM outreach_outcome o JOIN outreach_request r ON r.id=o.request_id
   WHERE r.need_id=n.id AND o.state='completed') AS completed_count,
 (SELECT COUNT(*) FROM outreach_outcome o JOIN outreach_request r ON r.id=o.request_id
   WHERE r.need_id=n.id AND o.state='did-not-proceed') AS did_not_proceed_count,
 (SELECT COUNT(*) FROM outreach_introduction i JOIN outreach_request r ON r.id=i.request_id
   WHERE r.need_id=n.id AND i.shared_at IS NOT NULL) AS shared_count
FROM school_need n
JOIN outreach_closure x ON x.need_id=n.id
WHERE julianday(x.closed_at)<=julianday('now','-12 months');

CREATE VIEW retention_profile_deletion_hold AS
SELECT d.id AS deletion_request_id,d.member_user_id,d.status,d.completed_at,
 CASE WHEN d.status='active' THEN NULL ELSE datetime(d.completed_at,'+12 months') END AS hold_until,
 COUNT(i.id) AS introduction_count,
 COALESCE(SUM(CASE WHEN i.shared_at IS NOT NULL THEN 1 ELSE 0 END),0) AS shared_count
FROM profile_deletion_request d
LEFT JOIN outreach_introduction i ON i.member_user_id=d.member_user_id
WHERE d.status='active'
 OR (d.status='completed' AND julianday(d.completed_at)>julianday('now','-12 months'))
GROUP BY d.id;

-- Ordinary cleanup may not delete retained records by elapsed time alone.
-- Every exception needs a matching retention execution row. Profile-deletion
-- processing is the sole non-retention exception, for the member's own thread.
DROP TRIGGER outreach_outcome_retain_delete;
CREATE TRIGGER outreach_outcome_retain_delete BEFORE DELETE ON outreach_outcome
WHEN NOT EXISTS(
 SELECT 1 FROM outreach_request r
 JOIN outreach_closure x ON x.need_id=r.need_id
 JOIN retention_execution e ON e.scope='outreach-records' AND e.target_id=r.need_id
 WHERE r.id=OLD.request_id
  AND julianday(x.closed_at)<=julianday('now','-12 months')
  AND EXISTS(SELECT 1 FROM school_need_retention_snapshot s WHERE s.need_id=r.need_id)
)
OR EXISTS(
 SELECT 1 FROM outreach_request r JOIN profile_deletion_request d
  ON d.member_user_id=r.recipient_user_id
 WHERE r.id=OLD.request_id AND (
  d.status='active'
  OR (d.status='completed' AND julianday(d.completed_at)>julianday('now','-12 months')))
)
BEGIN SELECT RAISE(ABORT,'Outreach outcome must be retained'); END;

DROP TRIGGER outreach_outcome_event_retain_delete;
CREATE TRIGGER outreach_outcome_event_retain_delete BEFORE DELETE ON outreach_outcome_event
WHEN NOT EXISTS(
 SELECT 1 FROM outreach_request r
 JOIN outreach_closure x ON x.need_id=r.need_id
 JOIN retention_execution e ON e.scope='outreach-records' AND e.target_id=r.need_id
 WHERE r.id=OLD.request_id
  AND julianday(x.closed_at)<=julianday('now','-12 months')
  AND EXISTS(SELECT 1 FROM school_need_retention_snapshot s WHERE s.need_id=r.need_id)
)
OR EXISTS(
 SELECT 1 FROM outreach_request r JOIN profile_deletion_request d
  ON d.member_user_id=r.recipient_user_id
 WHERE r.id=OLD.request_id AND (
  d.status='active'
  OR (d.status='completed' AND julianday(d.completed_at)>julianday('now','-12 months')))
)
BEGIN SELECT RAISE(ABORT,'Outreach outcome history must be retained'); END;

CREATE TRIGGER outreach_introduction_retain_delete BEFORE DELETE ON outreach_introduction
WHEN NOT EXISTS(
 SELECT 1 FROM outreach_request r
 JOIN outreach_closure x ON x.need_id=r.need_id
 JOIN retention_execution e ON e.scope='outreach-records' AND e.target_id=r.need_id
 WHERE r.id=OLD.request_id
  AND julianday(x.closed_at)<=julianday('now','-12 months')
  AND EXISTS(SELECT 1 FROM school_need_retention_snapshot s WHERE s.need_id=r.need_id)
)
OR EXISTS(
 SELECT 1 FROM profile_deletion_request d
 WHERE d.member_user_id=OLD.member_user_id AND (
  d.status='active'
  OR (d.status='completed' AND julianday(d.completed_at)>julianday('now','-12 months')))
)
BEGIN SELECT RAISE(ABORT,'Introduction evidence must be retained'); END;

CREATE TRIGGER outreach_request_retain_delete BEFORE DELETE ON outreach_request
WHEN NOT EXISTS(
 SELECT 1 FROM school_need x
 JOIN outreach_closure c ON c.need_id=x.id
 JOIN retention_execution e ON e.scope='outreach-records' AND e.target_id=x.id
 WHERE x.id=OLD.need_id
  AND julianday(c.closed_at)<=julianday('now','-12 months')
  AND EXISTS(SELECT 1 FROM school_need_retention_snapshot s WHERE s.need_id=x.id)
)
OR EXISTS(
 SELECT 1 FROM profile_deletion_request d
 WHERE d.member_user_id=OLD.recipient_user_id AND (
  d.status='active'
  OR (d.status='completed' AND julianday(d.completed_at)>julianday('now','-12 months')))
)
BEGIN SELECT RAISE(ABORT,'Outreach request must be retained'); END;

CREATE TRIGGER outreach_clarification_retain_delete BEFORE DELETE ON outreach_clarification
WHEN NOT EXISTS(
 SELECT 1 FROM outreach_request r
 WHERE r.id=OLD.request_id AND EXISTS(
  SELECT 1 FROM profile_deletion_request d
  WHERE d.member_user_id=r.recipient_user_id AND d.status='active')
)
AND NOT EXISTS(
 SELECT 1 FROM retention_clarification_candidate c
 JOIN retention_execution e ON e.scope='clarification-text' AND e.target_id=c.request_id
 WHERE c.request_id=OLD.request_id
)
BEGIN SELECT RAISE(ABORT,'Clarification text must be retained'); END;

CREATE TRIGGER profile_deletion_event_retain_delete BEFORE DELETE ON profile_deletion_event
WHEN NOT EXISTS(
 SELECT 1 FROM profile_deletion_request r
 JOIN retention_execution e ON e.scope='profile-deletion-evidence' AND e.target_id=r.id
 WHERE r.id=OLD.request_id AND r.status='completed'
  AND julianday(r.completed_at)<=julianday('now','-12 months')
)
BEGIN SELECT RAISE(ABORT,'Profile deletion evidence must be retained'); END;

CREATE TRIGGER profile_deletion_request_retain_delete BEFORE DELETE ON profile_deletion_request
WHEN NOT EXISTS(
 SELECT 1 FROM retention_execution e
 WHERE e.scope='profile-deletion-evidence' AND e.target_id=OLD.id
)
OR OLD.status!='completed'
OR julianday(OLD.completed_at)>julianday('now','-12 months')
BEGIN SELECT RAISE(ABORT,'Profile deletion evidence must be retained'); END;
