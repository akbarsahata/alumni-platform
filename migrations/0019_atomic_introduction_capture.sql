-- Local-only mailbox for introductions: capture and sharing evidence commit in
-- one D1 statement. Other local mail continues using the KV capture abstraction.
CREATE TABLE local_introduction_mail (
 recipient TEXT PRIMARY KEY,
 introduction_id TEXT NOT NULL REFERENCES outreach_introduction(id),
 message TEXT NOT NULL,
 captured_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);

CREATE TRIGGER local_introduction_mail_expiry BEFORE INSERT ON local_introduction_mail BEGIN
 DELETE FROM local_introduction_mail WHERE expires_at<=NEW.captured_at;
END;

CREATE TRIGGER local_introduction_mail_shared AFTER INSERT ON local_introduction_mail BEGIN
 UPDATE outreach_introduction SET delivery_state='captured',
  shared_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=NEW.introduction_id;
END;

-- A claim reserves a delivery attempt, but does not end the right to withdraw.
-- Invalidate claims too so restored eligibility cannot revive old consent.
DROP TRIGGER outreach_introduction_cancel_profile;
CREATE TRIGGER outreach_introduction_cancel_profile AFTER UPDATE ON expertise_profile
WHEN NOT EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=NEW.user_id) BEGIN
 UPDATE outreach_introduction SET invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  invalidation_reason='eligibility-changed',delivery_state='cancelled'
 WHERE member_user_id=NEW.user_id AND delivery_state IN('pending','claimed')
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL;
END;

DROP TRIGGER outreach_introduction_cancel_membership;
CREATE TRIGGER outreach_introduction_cancel_membership AFTER UPDATE ON alumni_membership
WHEN NEW.status!='approved' BEGIN
 UPDATE outreach_introduction SET invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  invalidation_reason='eligibility-changed',delivery_state='cancelled'
 WHERE member_user_id=NEW.user_id AND delivery_state IN('pending','claimed')
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL;
END;

DROP TRIGGER outreach_staff_recipient_changed;
CREATE TRIGGER outreach_staff_recipient_changed AFTER UPDATE OF user_id ON outreach_staff_recipient BEGIN
 UPDATE outreach_introduction SET invalidated_at=NEW.assigned_at,
  invalidation_reason='staff-recipient-changed',delivery_state='cancelled'
 WHERE need_id=NEW.need_id AND delivery_state IN('pending','claimed')
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL;
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.assigned_by,'staff-recipient-changed',NEW.assigned_at);
END;
