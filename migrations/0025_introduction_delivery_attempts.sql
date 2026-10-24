-- Provider delivery attempts are a serialization boundary: once a provider
-- request may be in flight, withdrawal and eligibility invalidation must not
-- race the irreversible send. The attempt row also preserves enough state to
-- reconcile an accepted or ambiguous response without blind resends.
ALTER TABLE outreach_introduction ADD COLUMN delivery_mode TEXT
 CHECK(delivery_mode IS NULL OR delivery_mode IN('local','provider'));

CREATE TABLE outreach_introduction_delivery (
 introduction_id TEXT PRIMARY KEY REFERENCES outreach_introduction(id),
 attempt INTEGER NOT NULL DEFAULT 1 CHECK(attempt>0),
 idempotency_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('dispatching','accepted','failed','ambiguous')),
 staff_email TEXT NOT NULL,
 member_email TEXT NOT NULL,
 started_at TEXT NOT NULL,
 last_attempt_at TEXT NOT NULL,
 accepted_at TEXT,
 failed_at TEXT,
 provider_message_id TEXT,
 CHECK((state='accepted')=(accepted_at IS NOT NULL)),
 CHECK((state='failed')=(failed_at IS NOT NULL)),
 CHECK(state!='accepted' OR provider_message_id IS NOT NULL)
);
CREATE INDEX outreach_introduction_delivery_state
 ON outreach_introduction_delivery(state,last_attempt_at);

-- A provider claim atomically creates or advances its attempt. The idempotency
-- key stays stable for the introduction so a retry cannot duplicate an accepted
-- message. started_at is the first provider attempt and therefore the start of
-- Resend's 24-hour idempotency window.
CREATE TRIGGER outreach_introduction_delivery_begin
AFTER UPDATE OF delivery_state,claimed_at ON outreach_introduction
WHEN NEW.delivery_state='claimed' AND NEW.delivery_mode='provider' BEGIN
 INSERT INTO outreach_introduction_delivery(introduction_id,attempt,idempotency_key,
  state,staff_email,member_email,started_at,last_attempt_at)
 SELECT NEW.id,1,'outreach-introduction:'||NEW.id,'dispatching',
  su.email,NEW.member_email,NEW.claimed_at,NEW.claimed_at
 FROM user su WHERE su.id=NEW.staff_user_id AND su.email_verified=1
 ON CONFLICT(introduction_id) DO UPDATE SET
  attempt=outreach_introduction_delivery.attempt+1,
  state='dispatching',
  started_at=CASE WHEN outreach_introduction_delivery.state='failed'
   THEN excluded.started_at ELSE outreach_introduction_delivery.started_at END,
  last_attempt_at=excluded.last_attempt_at,
  accepted_at=NULL,
  failed_at=NULL,
  provider_message_id=NULL,
  staff_email=CASE WHEN outreach_introduction_delivery.state='failed'
   THEN excluded.staff_email ELSE outreach_introduction_delivery.staff_email END,
  member_email=CASE WHEN outreach_introduction_delivery.state='failed'
   THEN excluded.member_email ELSE outreach_introduction_delivery.member_email END
 WHERE outreach_introduction_delivery.state IN('failed','dispatching','ambiguous');
END;

-- Invalidation remains immediate before a provider attempt, but an active
-- attempt is serialized with the irreversible send. If eligibility changes while
-- the provider is processing, the accepted send still records its consent
-- evidence and a later consent must be fresh.
DROP TRIGGER outreach_introduction_cancel_profile;
CREATE TRIGGER outreach_introduction_cancel_profile AFTER UPDATE ON expertise_profile
WHEN NOT EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=NEW.user_id) BEGIN
 UPDATE outreach_introduction SET invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  invalidation_reason='eligibility-changed',delivery_state='cancelled'
 WHERE member_user_id=NEW.user_id AND delivery_state IN('pending','claimed')
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM outreach_introduction_delivery d
   WHERE d.introduction_id=outreach_introduction.id
    AND d.state IN('dispatching','accepted','ambiguous'));
END;

DROP TRIGGER outreach_introduction_cancel_membership;
CREATE TRIGGER outreach_introduction_cancel_membership AFTER UPDATE ON alumni_membership
WHEN NEW.status!='approved' BEGIN
 UPDATE outreach_introduction SET invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  invalidation_reason='eligibility-changed',delivery_state='cancelled'
 WHERE member_user_id=NEW.user_id AND delivery_state IN('pending','claimed')
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM outreach_introduction_delivery d
   WHERE d.introduction_id=outreach_introduction.id
    AND d.state IN('dispatching','accepted','ambiguous'));
END;

DROP TRIGGER outreach_staff_recipient_changed;
CREATE TRIGGER outreach_staff_recipient_changed AFTER UPDATE OF user_id ON outreach_staff_recipient BEGIN
 UPDATE outreach_introduction SET invalidated_at=NEW.assigned_at,
  invalidation_reason='staff-recipient-changed',delivery_state='cancelled'
 WHERE need_id=NEW.need_id AND delivery_state IN('pending','claimed')
  AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM outreach_introduction_delivery d
   WHERE d.introduction_id=outreach_introduction.id
    AND d.state IN('dispatching','accepted','ambiguous'));
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.assigned_by,'staff-recipient-changed',NEW.assigned_at);
END;
