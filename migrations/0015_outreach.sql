-- Eligibility is evaluated against current records at every transition.
CREATE VIEW outreach_eligible_recipient AS
 SELECT p.user_id FROM expertise_profile p JOIN alumni_membership m ON m.user_id=p.user_id
 JOIN user u ON u.id=p.user_id
 WHERE m.status='approved' AND u.email_verified=1 AND p.participation=1
 AND p.deletion_requested_at IS NULL AND p.availability IN('available','limited')
 AND length(trim(p.introduction))>0 AND json_array_length(p.expertise_tags)>0
 AND json_array_length(p.help_types)>0
 AND julianday('now') < julianday(p.confirmed_at,'+1 year','floor');

CREATE TABLE outreach_closure (
 need_id TEXT PRIMARY KEY REFERENCES school_need(id),
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 closed_at TEXT NOT NULL
);
CREATE VIEW outreach_approved_need AS
 SELECT n.id FROM school_need n
 JOIN school_need_approval s ON s.need_id=n.id AND s.version=n.version AND s.stage='staff-validation'
 JOIN school_need_approval c ON c.need_id=n.id AND c.version=n.version AND c.stage='directory-approval'
 JOIN role_assignment sr ON sr.user_id=s.actor_user_id AND sr.role='staff'
 JOIN role_assignment cr ON cr.user_id=c.actor_user_id AND cr.role='directory-coordinator'
 JOIN user u ON u.id=n.staff_contact_user_id
 WHERE s.actor_user_id=n.staff_contact_user_id AND s.actor_user_id!=c.actor_user_id
 AND u.email_verified=1 AND NOT EXISTS(SELECT 1 FROM outreach_closure x WHERE x.need_id=n.id);

CREATE TABLE outreach_request (
 id TEXT PRIMARY KEY,
 need_id TEXT NOT NULL REFERENCES school_need(id),
 need_version INTEGER NOT NULL,
 recipient_user_id TEXT NOT NULL REFERENCES user(id),
 coordinator_user_id TEXT NOT NULL REFERENCES user(id),
 sent_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','interested','declined','cancelled')),
 decline_reason TEXT NOT NULL DEFAULT '',
 responded_at TEXT,
 reminder_at TEXT,
 updated_by TEXT NOT NULL REFERENCES user(id),
 updated_at TEXT NOT NULL,
 UNIQUE(need_id,recipient_user_id),
 FOREIGN KEY(need_id,need_version) REFERENCES school_need_revision(need_id,version)
);
CREATE INDEX outreach_recipient_window ON outreach_request(recipient_user_id,sent_at);
CREATE INDEX outreach_need_requests ON outreach_request(need_id,sent_at);
CREATE TABLE outreach_notification (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES outreach_request(id),
 kind TEXT NOT NULL CHECK(kind IN('request','reminder')),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','claimed','captured','cancelled')),
 UNIQUE(request_id,kind)
);
CREATE TABLE outreach_audit (
 id TEXT PRIMARY KEY,
 need_id TEXT NOT NULL REFERENCES school_need(id),
 actor_user_id TEXT REFERENCES user(id),
 action TEXT NOT NULL,
 occurred_at TEXT NOT NULL
);
CREATE TRIGGER outreach_insert_history AFTER INSERT ON outreach_request BEGIN
 INSERT INTO outreach_notification(id,request_id,kind) VALUES(NEW.id || ':request',NEW.id,'request');
 INSERT INTO outreach_audit VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.updated_by,'request-sent',NEW.sent_at);
END;
CREATE TRIGGER outreach_update_history AFTER UPDATE ON outreach_request BEGIN
 INSERT INTO outreach_audit VALUES(lower(hex(randomblob(16))),NEW.need_id,CASE WHEN NEW.status='cancelled' AND NEW.updated_by=NEW.recipient_user_id THEN NULL ELSE NEW.updated_by END,
 CASE WHEN NEW.coordinator_user_id!=OLD.coordinator_user_id THEN 'assignment-changed'
 WHEN NEW.reminder_at IS NOT OLD.reminder_at THEN 'reminder-requested'
 ELSE NEW.status END,NEW.updated_at);
 UPDATE outreach_notification SET state='cancelled' WHERE request_id=NEW.id
 AND state IN('pending','claimed') AND NEW.status!='pending';
END;

-- A sent version stays immutable, including after all requests end.
CREATE TRIGGER outreach_freeze_need BEFORE UPDATE ON school_need
 WHEN EXISTS(SELECT 1 FROM outreach_request WHERE need_id=OLD.id)
 OR EXISTS(SELECT 1 FROM outreach_closure WHERE need_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Sent or closed needs cannot be edited'); END;
CREATE TRIGGER outreach_close_history AFTER INSERT ON outreach_closure BEGIN
 UPDATE outreach_request SET status='cancelled',updated_by=NEW.actor_user_id,updated_at=NEW.closed_at
 WHERE need_id=NEW.need_id AND status='pending';
 INSERT INTO outreach_audit VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.actor_user_id,'need-closed',NEW.closed_at);
END;
CREATE TRIGGER outreach_cancel_profile AFTER UPDATE ON expertise_profile
 WHEN NOT EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=NEW.user_id) BEGIN
 UPDATE outreach_request SET status='cancelled',updated_by=NEW.user_id,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE recipient_user_id=NEW.user_id AND status='pending';
END;
CREATE TRIGGER outreach_cancel_membership AFTER UPDATE ON alumni_membership WHEN NEW.status!='approved' BEGIN
 UPDATE outreach_request SET status='cancelled',updated_by=NEW.user_id,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE recipient_user_id=NEW.user_id AND status='pending';
END;
CREATE TRIGGER outreach_reminder_intent AFTER UPDATE OF reminder_at ON outreach_request
 WHEN OLD.reminder_at IS NULL AND NEW.reminder_at IS NOT NULL BEGIN
 INSERT INTO outreach_notification(id,request_id,kind) VALUES(NEW.id || ':reminder',NEW.id,'reminder');
END;
