-- A versioned decision, membership update, request resolution and email commit atomically.
CREATE TABLE membership_status_decision (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id),
 version INTEGER NOT NULL CHECK(version > 0),
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('suspended','approved')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 applicant_message TEXT NOT NULL CHECK(length(trim(applicant_message)) BETWEEN 1 AND 1000),
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(user_id,version),
 CHECK(actor_user_id != user_id)
);
CREATE TABLE membership_suspension_request (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id),
 suspension_id TEXT NOT NULL UNIQUE REFERENCES membership_status_decision(id),
 explanation TEXT NOT NULL CHECK(length(trim(explanation)) BETWEEN 1 AND 1000),
 requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 resolved_by TEXT REFERENCES membership_status_decision(id)
);
CREATE UNIQUE INDEX membership_one_outstanding_request ON membership_suspension_request(user_id) WHERE resolved_by IS NULL;
CREATE TRIGGER membership_status_validate BEFORE INSERT ON membership_status_decision BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment a JOIN user u ON u.id=a.user_id AND u.email_verified=1
 WHERE a.user_id=NEW.actor_user_id AND a.role='membership-administrator')
 OR NOT EXISTS(SELECT 1 FROM alumni_membership WHERE user_id=NEW.user_id AND status != NEW.outcome)
 OR NEW.version != (SELECT count(*)+1 FROM membership_status_decision WHERE user_id=NEW.user_id)
 OR EXISTS(SELECT 1 FROM membership_reference q JOIN membership_reference_response s ON s.request_id=q.id
 WHERE q.user_id=NEW.user_id AND s.actor_user_id=NEW.actor_user_id AND s.outcome='endorse')
 THEN RAISE(ABORT,'Status decision requires independent current review') END;
END;
CREATE TRIGGER membership_status_apply AFTER INSERT ON membership_status_decision BEGIN
 UPDATE alumni_membership SET status=NEW.outcome WHERE user_id=NEW.user_id;
 UPDATE membership_suspension_request SET resolved_by=NEW.id WHERE user_id=NEW.user_id AND resolved_by IS NULL;
 INSERT INTO membership_notification(id,user_id,to_email,kind,message)
 SELECT NEW.id,NEW.user_id,email,CASE WHEN NEW.outcome='approved' THEN 'approved' ELSE 'action-required' END,
 CASE WHEN NEW.outcome='approved' THEN 'Keanggotaan dipulihkan. ' ELSE 'Keanggotaan ditangguhkan. Anda dapat meminta tinjauan. ' END || NEW.applicant_message
 FROM user WHERE id=NEW.user_id;
END;
CREATE TRIGGER membership_suspension_request_validate BEFORE INSERT ON membership_suspension_request BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM alumni_membership m JOIN membership_status_decision d ON d.user_id=m.user_id
 WHERE m.user_id=NEW.user_id AND m.status='suspended' AND d.id=NEW.suspension_id AND d.outcome='suspended'
 AND d.version=(SELECT max(version) FROM membership_status_decision WHERE user_id=NEW.user_id))
 THEN RAISE(ABORT,'Request requires current suspension') END;
END;
