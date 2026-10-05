CREATE TABLE membership_reference (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  to_email TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days')),
  delivered_at TEXT,
  UNIQUE(user_id,revision),
  FOREIGN KEY(user_id,revision) REFERENCES membership_revision(user_id,revision)
);
CREATE TABLE membership_reference_response (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES membership_reference(id),
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  outcome TEXT NOT NULL CHECK(outcome IN ('endorse','decline','cannot-confirm')),
  personally_known INTEGER NOT NULL CHECK(personally_known IN (0,1)),
  comment TEXT NOT NULL CHECK(length(comment) <= 1000),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(outcome != 'endorse' OR personally_known = 1)
);
CREATE TRIGGER membership_reference_validate BEFORE INSERT ON membership_reference BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM membership_application a JOIN membership_revision r
    ON r.user_id = a.user_id AND r.revision = a.revision
    WHERE a.user_id = NEW.user_id AND a.revision = NEW.revision
    AND a.status = 'pending' AND r.student_type = 'graduate'
  ) OR EXISTS(SELECT 1 FROM alumni_membership WHERE user_id = NEW.user_id)
  THEN RAISE(ABORT,'Reference requires current graduate application') END;
END;
CREATE TRIGGER membership_reference_response_validate BEFORE INSERT ON membership_reference_response BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM membership_reference q JOIN membership_application a
    ON a.user_id = q.user_id AND a.revision = q.revision
    JOIN membership_revision r ON r.user_id = a.user_id AND r.revision = a.revision
    JOIN user u ON u.id = NEW.actor_user_id AND u.email_verified = 1
    JOIN alumni_membership m ON m.user_id = u.id AND m.status = 'approved' AND m.house = r.house
    WHERE q.id = NEW.request_id AND lower(u.email) = q.to_email AND u.id != q.user_id
    AND a.status = 'pending' AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
  ) THEN RAISE(ABORT,'Reference requires current eligible recipient') END;
END;
-- Endorsers cannot decide even after a subsequent application correction.
CREATE TRIGGER membership_reference_decision_validate BEFORE INSERT ON membership_decision BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM membership_reference q JOIN membership_reference_response s ON s.request_id = q.id
    WHERE q.user_id = NEW.user_id AND s.actor_user_id = NEW.actor_user_id AND s.outcome = 'endorse'
  ) OR EXISTS (
    SELECT 1 FROM membership_reference q WHERE q.user_id = NEW.user_id AND q.revision = NEW.revision
    AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND NOT EXISTS(SELECT 1 FROM membership_reference_response WHERE request_id = q.id)
  ) THEN RAISE(ABORT,'Decision requires settled independent review') END;
END;
-- The existing notification outbox can persist neutral reference action messages.
CREATE TRIGGER membership_reference_response_notify AFTER INSERT ON membership_reference_response
WHEN NEW.outcome != 'endorse' BEGIN
  INSERT INTO membership_notification(id,user_id,to_email,kind,message)
  SELECT 'reference:' || NEW.request_id,q.user_id,u.email,'submitted',
    'Pengajuan Anda memerlukan tinjauan manual. Lengkapi penjelasan bila diperlukan.'
  FROM membership_reference q JOIN user u ON u.id = q.user_id WHERE q.id = NEW.request_id;
END;
