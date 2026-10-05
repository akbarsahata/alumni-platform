-- One application aggregate per account. Every correction is an immutable revision.
CREATE TABLE membership_application (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','action-required','rejected','approved')),
  updated_at TEXT NOT NULL
);
CREATE TABLE membership_revision (
  user_id TEXT NOT NULL REFERENCES user(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  school_name TEXT NOT NULL CHECK (length(trim(school_name)) BETWEEN 1 AND 200),
  student_type TEXT NOT NULL CHECK (student_type IN ('graduate','former-student')),
  graduation_year INTEGER,
  attendance_start INTEGER,
  attendance_end INTEGER,
  house TEXT NOT NULL CHECK (house IN ('Komodo','Lion','Rhino','Hornbill','Dove','Eagle','Dolphin','Shark','Mantaray')),
  explanation TEXT NOT NULL CHECK (length(trim(explanation)) BETWEEN 1 AND 1000),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id,revision),
  CHECK ((student_type = 'graduate' AND graduation_year BETWEEN 1900 AND 2100
      AND graduation_year IS NOT NULL AND attendance_start IS NULL AND attendance_end IS NULL)
    OR (student_type = 'former-student' AND graduation_year IS NULL
      AND attendance_start IS NOT NULL AND attendance_end IS NOT NULL
      AND attendance_start BETWEEN 1900 AND 2100 AND attendance_end BETWEEN attendance_start AND 2100))
);
CREATE TRIGGER membership_revision_validate BEFORE INSERT ON membership_revision BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id AND email_verified = 1)
    OR EXISTS (SELECT 1 FROM alumni_membership WHERE user_id = NEW.user_id)
    OR NEW.revision != COALESCE((SELECT revision + 1 FROM membership_application WHERE user_id = NEW.user_id),1)
    OR EXISTS (SELECT 1 FROM membership_application WHERE user_id = NEW.user_id AND status = 'approved')
    THEN RAISE(ABORT, 'Application cannot be revised') END;
END;
CREATE TABLE membership_decision (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','rejected','action-required')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  applicant_message TEXT NOT NULL CHECK (length(trim(applicant_message)) BETWEEN 1 AND 1000),
  check_source TEXT CHECK (check_source IN ('trusted-alumnus','school-staff')),
  check_note TEXT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id,revision),
  FOREIGN KEY (user_id,revision) REFERENCES membership_revision(user_id,revision),
  CHECK (actor_user_id != user_id),
  CHECK ((outcome = 'action-required' AND check_source IS NULL AND check_note IS NULL)
    OR (outcome IN ('approved','rejected') AND check_source IS NOT NULL AND check_note IS NOT NULL
      AND length(trim(check_note)) BETWEEN 1 AND 1000))
);
CREATE TRIGGER membership_decision_validate BEFORE INSERT ON membership_decision BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM role_assignment WHERE user_id = NEW.actor_user_id AND role = 'membership-administrator')
    OR NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.actor_user_id AND email_verified = 1)
    OR NOT EXISTS (SELECT 1 FROM membership_application WHERE user_id = NEW.user_id AND revision = NEW.revision AND status = 'pending')
    OR EXISTS (SELECT 1 FROM alumni_membership WHERE user_id = NEW.user_id)
    THEN RAISE(ABORT, 'Decision requires independent current review') END;
END;
-- Capture is attempted after commit; pending messages survive a delivery failure.
CREATE TABLE membership_notification (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id),
  to_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('submitted','approved','rejected','action-required')),
  message TEXT NOT NULL,
  delivered_at TEXT
);
CREATE TRIGGER membership_submission_notify AFTER INSERT ON membership_revision BEGIN
  INSERT INTO membership_notification (id,user_id,to_email,kind,message)
    SELECT 'revision:' || NEW.user_id || ':' || NEW.revision,NEW.user_id,email,'submitted',
      'Pengajuan Anda menunggu tinjauan manual. Anda dapat memperbaiki data selama belum disetujui.'
    FROM user WHERE id = NEW.user_id;
END;
CREATE TRIGGER membership_decision_notify AFTER INSERT ON membership_decision BEGIN
  INSERT INTO membership_notification (id,user_id,to_email,kind,message)
    SELECT NEW.id,NEW.user_id,email,NEW.outcome,NEW.applicant_message FROM user WHERE id = NEW.user_id;
END;
CREATE TRIGGER membership_decision_apply AFTER INSERT ON membership_decision BEGIN
  UPDATE membership_application SET status = NEW.outcome, updated_at = NEW.occurred_at WHERE user_id = NEW.user_id;
  INSERT INTO alumni_membership (user_id,status,house)
    SELECT NEW.user_id,'approved',house FROM membership_revision
    WHERE user_id = NEW.user_id AND revision = NEW.revision AND NEW.outcome = 'approved';
END;
CREATE TRIGGER membership_revision_apply AFTER INSERT ON membership_revision BEGIN
  INSERT INTO membership_application (user_id,revision,status,updated_at)
    VALUES (NEW.user_id,NEW.revision,'pending',NEW.submitted_at)
    ON CONFLICT(user_id) DO UPDATE SET revision = NEW.revision,status = 'pending',updated_at = NEW.submitted_at;
END;
