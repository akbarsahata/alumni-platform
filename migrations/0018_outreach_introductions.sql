-- Restricted evidence of a member's explicit sharing consent and the one-time
-- introduction it authorizes. The member email is deliberately kept out of the
-- general outreach audit; audit rows carry only IDs, actions and UTC times.
CREATE TABLE outreach_introduction (
 id TEXT PRIMARY KEY,
 need_id TEXT NOT NULL REFERENCES school_need(id),
 request_id TEXT NOT NULL REFERENCES outreach_request(id),
 member_user_id TEXT NOT NULL REFERENCES user(id),
 staff_user_id TEXT NOT NULL REFERENCES user(id),
 member_email TEXT NOT NULL,
 consented_at TEXT NOT NULL,
 withdrawn_at TEXT,
 invalidated_at TEXT,
 invalidation_reason TEXT,
 delivery_state TEXT NOT NULL DEFAULT 'pending'
  CHECK(delivery_state IN('pending','claimed','captured','cancelled')),
 claimed_at TEXT,
 shared_at TEXT,
 CHECK((delivery_state='captured' AND shared_at IS NOT NULL)
   OR (delivery_state!='captured' AND shared_at IS NULL))
);

CREATE INDEX outreach_introduction_request ON outreach_introduction(request_id,consented_at);
CREATE INDEX outreach_introduction_need ON outreach_introduction(need_id,consented_at);
CREATE INDEX outreach_introduction_member ON outreach_introduction(member_user_id);

-- At most one active consent per request, and one shared introduction per
-- request for each named staff recipient.
CREATE UNIQUE INDEX outreach_introduction_active ON outreach_introduction(request_id)
 WHERE shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL;
CREATE UNIQUE INDEX outreach_introduction_shared ON outreach_introduction(request_id,staff_user_id)
 WHERE shared_at IS NOT NULL;

CREATE TRIGGER outreach_introduction_insert_history AFTER INSERT ON outreach_introduction BEGIN
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.member_user_id,'consent-recorded',NEW.consented_at);
END;

CREATE TRIGGER outreach_introduction_withdraw_history AFTER UPDATE OF withdrawn_at ON outreach_introduction
WHEN OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL BEGIN
 UPDATE outreach_introduction SET delivery_state='cancelled'
 WHERE id=NEW.id AND shared_at IS NULL;
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.member_user_id,'consent-withdrawn',NEW.withdrawn_at);
END;

CREATE TRIGGER outreach_introduction_invalidate_history AFTER UPDATE OF invalidated_at ON outreach_introduction
WHEN OLD.invalidated_at IS NULL AND NEW.invalidated_at IS NOT NULL BEGIN
 UPDATE outreach_introduction SET delivery_state='cancelled'
 WHERE id=NEW.id AND shared_at IS NULL;
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NULL,'consent-invalidated',NEW.invalidated_at);
END;

CREATE TRIGGER outreach_introduction_share_history AFTER UPDATE OF shared_at ON outreach_introduction
WHEN OLD.shared_at IS NULL AND NEW.shared_at IS NOT NULL BEGIN
 UPDATE outreach_introduction SET delivery_state='captured' WHERE id=NEW.id;
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NULL,'introduction-shared',NEW.shared_at);
END;

-- Eligibility loss immediately cancels a queued introduction. Claimed delivery
-- is already in progress and is handled by the delivery recheck; shared evidence
-- is never invalidated.
CREATE TRIGGER outreach_introduction_cancel_profile AFTER UPDATE ON expertise_profile
WHEN NOT EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=NEW.user_id) BEGIN
 UPDATE outreach_introduction SET invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  invalidation_reason='eligibility-changed',delivery_state='cancelled'
 WHERE member_user_id=NEW.user_id AND delivery_state='pending'
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL;
END;

CREATE TRIGGER outreach_introduction_cancel_membership AFTER UPDATE ON alumni_membership
WHEN NEW.status!='approved' BEGIN
 UPDATE outreach_introduction SET invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  invalidation_reason='eligibility-changed',delivery_state='cancelled'
 WHERE member_user_id=NEW.user_id AND delivery_state='pending'
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL;
END;

-- A replacement staff recipient cannot inherit the previous recipient's consent.
CREATE TRIGGER outreach_staff_recipient_changed AFTER UPDATE OF user_id ON outreach_staff_recipient BEGIN
 UPDATE outreach_introduction SET invalidated_at=NEW.assigned_at,
  invalidation_reason='staff-recipient-changed',delivery_state='cancelled'
 WHERE need_id=NEW.need_id AND delivery_state='pending'
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL;
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.assigned_by,'staff-recipient-changed',NEW.assigned_at);
END;
