-- One current outcome per shared outreach request. Revision zero is the derived
-- introduced baseline; later revisions identify append-only human events.
CREATE TABLE outreach_outcome (
 request_id TEXT PRIMARY KEY REFERENCES outreach_request(id),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
 state TEXT NOT NULL CHECK(state IN('introduced','help-confirmed','completed','did-not-proceed')),
 introduced_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE TABLE outreach_outcome_event (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES outreach_request(id),
 revision INTEGER NOT NULL CHECK(revision > 0),
 kind TEXT NOT NULL CHECK(kind IN('record','confirm','correct')),
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN('member','coordinator')),
 previous_state TEXT NOT NULL
  CHECK(previous_state IN('introduced','help-confirmed','completed','did-not-proceed')),
 state TEXT NOT NULL CHECK(state IN('introduced','help-confirmed','completed','did-not-proceed')),
 note TEXT CHECK(note IS NULL OR (
  length(trim(note)) BETWEEN 1 AND 500 AND note=trim(note)
 )),
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(request_id,revision),
 CHECK(
  (kind='record' AND actor_kind='coordinator' AND note IS NOT NULL)
  OR (kind='confirm' AND actor_kind='member' AND note IS NULL AND state=previous_state)
  OR (kind='correct' AND actor_kind='member' AND note IS NOT NULL)
 )
);
CREATE INDEX outreach_outcome_event_history ON outreach_outcome_event(request_id,occurred_at);

-- Existing committed sharing is the only backfill baseline. Consent-only,
-- attempted, withdrawn and invalidated introductions never become outcomes.
INSERT INTO outreach_outcome(request_id,revision,state,introduced_at,updated_at)
SELECT request_id,0,'introduced',MIN(shared_at),MIN(shared_at)
FROM outreach_introduction
WHERE shared_at IS NOT NULL
GROUP BY request_id;

-- The first newly committed share creates the baseline without resetting an
-- existing outcome or its human history. Later recipient shares are no-ops.
CREATE TRIGGER outreach_outcome_introduced AFTER UPDATE OF shared_at ON outreach_introduction
WHEN OLD.shared_at IS NULL AND NEW.shared_at IS NOT NULL BEGIN
 INSERT OR IGNORE INTO outreach_outcome(request_id,revision,state,introduced_at,updated_at)
 SELECT NEW.request_id,0,'introduced',
  (SELECT MIN(shared_at) FROM outreach_introduction
    WHERE request_id=NEW.request_id AND shared_at IS NOT NULL),
  (SELECT MIN(shared_at) FROM outreach_introduction
    WHERE request_id=NEW.request_id AND shared_at IS NOT NULL)
 WHERE NOT EXISTS(SELECT 1 FROM outreach_outcome o WHERE o.request_id=NEW.request_id)
  AND EXISTS(SELECT 1 FROM outreach_introduction
   WHERE request_id=NEW.request_id AND shared_at IS NOT NULL);
END;

-- Recheck request ownership/access, actor authority, current membership where
-- applicable, shared evidence and the expected revision in the same write.
CREATE TRIGGER outreach_outcome_event_validate BEFORE INSERT ON outreach_outcome_event BEGIN
 SELECT CASE WHEN
  NOT EXISTS(SELECT 1 FROM outreach_outcome o WHERE o.request_id=NEW.request_id)
  OR NEW.revision!=(SELECT revision+1 FROM outreach_outcome WHERE request_id=NEW.request_id)
  OR NEW.previous_state!=(SELECT state FROM outreach_outcome WHERE request_id=NEW.request_id)
  OR NOT EXISTS(
    SELECT 1 FROM outreach_request r
    WHERE r.id=NEW.request_id AND r.status='interested'
      AND EXISTS(SELECT 1 FROM outreach_introduction i
        WHERE i.request_id=r.id AND i.shared_at IS NOT NULL))
  OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.actor_user_id AND u.email_verified=1)
  OR (NEW.actor_kind='coordinator' AND NOT EXISTS(
    SELECT 1 FROM role_assignment ra
    WHERE ra.user_id=NEW.actor_user_id AND ra.role='directory-coordinator'))
  OR (NEW.actor_kind='member' AND (
    NOT EXISTS(SELECT 1 FROM outreach_request r
      WHERE r.id=NEW.request_id AND r.recipient_user_id=NEW.actor_user_id)
    OR NOT EXISTS(SELECT 1 FROM alumni_membership m
      WHERE m.user_id=NEW.actor_user_id AND m.status='approved')))
  THEN RAISE(ABORT,'Invalid outreach outcome event') END;
END;

CREATE TRIGGER outreach_outcome_event_apply AFTER INSERT ON outreach_outcome_event BEGIN
 UPDATE outreach_outcome SET revision=NEW.revision,state=NEW.state,updated_at=NEW.occurred_at
 WHERE request_id=NEW.request_id AND revision=NEW.revision-1;
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 SELECT lower(hex(randomblob(16))),r.need_id,NEW.actor_user_id,
  CASE NEW.kind
   WHEN 'record' THEN 'outcome-recorded'
   WHEN 'confirm' THEN 'outcome-confirmed'
   ELSE 'outcome-corrected'
  END,
  NEW.occurred_at
 FROM outreach_request r WHERE r.id=NEW.request_id;
END;

-- The projection is derived from the appended event. Direct edits, deletions
-- and rewritten history are rejected during normal operation.
CREATE TRIGGER outreach_outcome_projection_update BEFORE UPDATE ON outreach_outcome
WHEN NEW.request_id!=OLD.request_id
 OR NEW.introduced_at!=OLD.introduced_at
 OR NEW.revision!=OLD.revision+1
 OR NOT EXISTS(
   SELECT 1 FROM outreach_outcome_event e
   WHERE e.request_id=OLD.request_id AND e.revision=NEW.revision
     AND e.previous_state=OLD.state AND e.state=NEW.state
     AND e.occurred_at=NEW.updated_at)
 BEGIN SELECT RAISE(ABORT,'Outreach outcome projection is derived'); END;

CREATE TRIGGER outreach_outcome_retain_delete BEFORE DELETE ON outreach_outcome
BEGIN SELECT RAISE(ABORT,'Outreach outcome history must be retained'); END;

CREATE TRIGGER outreach_outcome_event_retain_update BEFORE UPDATE ON outreach_outcome_event
BEGIN SELECT RAISE(ABORT,'Outreach outcome history must be retained'); END;

CREATE TRIGGER outreach_outcome_event_retain_delete BEFORE DELETE ON outreach_outcome_event
BEGIN SELECT RAISE(ABORT,'Outreach outcome history must be retained'); END;
