CREATE TABLE email_change_request (
  id TEXT PRIMARY KEY NOT NULL,
  target_user_id TEXT NOT NULL REFERENCES user(id),
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  verified_by TEXT REFERENCES user(id),
  ended_by TEXT REFERENCES user(id),
  old_email TEXT NOT NULL CHECK(old_email = lower(old_email)),
  new_email TEXT NOT NULL CHECK(length(new_email) BETWEEN 3 AND 254 AND new_email = lower(new_email)),
  identity_check TEXT NOT NULL CHECK(length(trim(identity_check)) BETWEEN 1 AND 1000),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
  token_hash TEXT NOT NULL CHECK(
    (status = 'pending' AND length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*')
    OR (status != 'pending' AND token_hash='')
  ),
  status TEXT NOT NULL CHECK(status IN ('pending','completed','expired','replaced','collision')),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes')),
  completed_at TEXT,
  ended_at TEXT,
  CHECK(actor_user_id != target_user_id),
  CHECK((status = 'completed') = (verified_by IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX email_change_one_pending_per_target
  ON email_change_request(target_user_id) WHERE status = 'pending';
CREATE INDEX email_change_audit_time ON email_change_request(requested_at);

CREATE TRIGGER email_change_request_validate BEFORE INSERT ON email_change_request BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM user u JOIN role_assignment r ON r.user_id=u.id
    WHERE u.id=NEW.actor_user_id AND u.email_verified=1 AND r.role='membership-administrator'
  ) OR NEW.actor_user_id=NEW.target_user_id
    OR NOT EXISTS (SELECT 1 FROM user WHERE id=NEW.target_user_id AND email_verified=1 AND lower(email)=NEW.old_email)
    OR lower(NEW.old_email)=NEW.new_email
    OR EXISTS (SELECT 1 FROM user WHERE lower(email)=NEW.new_email)
    OR NEW.status != 'pending' OR NEW.verified_by IS NOT NULL
    OR NEW.expires_at <= NEW.requested_at
    THEN RAISE(ABORT,'Invalid email change request') END;
END;

CREATE TRIGGER email_change_request_update_validate BEFORE UPDATE ON email_change_request BEGIN
  SELECT CASE WHEN OLD.status != 'pending'
    OR NEW.id != OLD.id OR NEW.target_user_id != OLD.target_user_id
    OR NEW.actor_user_id != OLD.actor_user_id OR NEW.old_email != OLD.old_email
    OR NEW.new_email != OLD.new_email OR NEW.identity_check != OLD.identity_check
    OR NEW.reason != OLD.reason OR NEW.requested_at != OLD.requested_at
    OR NEW.expires_at != OLD.expires_at
    OR NEW.status NOT IN ('completed','expired','replaced','collision')
    OR (NEW.status='completed' AND (
      NEW.verified_by != NEW.target_user_id OR NEW.completed_at IS NULL OR NEW.ended_at IS NOT NULL
      OR NEW.ended_by IS NOT NULL
      OR NEW.token_hash != ''
      OR OLD.expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      OR NOT EXISTS (SELECT 1 FROM user WHERE id=OLD.target_user_id AND email_verified=1 AND lower(email)=OLD.old_email)
      OR EXISTS (SELECT 1 FROM user WHERE id != OLD.target_user_id AND lower(email)=OLD.new_email)
      OR NOT EXISTS (SELECT 1 FROM role_assignment WHERE user_id=OLD.actor_user_id AND role='membership-administrator')
    ))
    OR (NEW.status != 'completed' AND (
      NEW.verified_by IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.ended_at IS NULL
      OR NEW.token_hash != ''
    ))
    OR (NEW.status='expired' AND OLD.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    OR (NEW.status='replaced' AND (
      NEW.ended_by IS NULL OR NOT EXISTS (
      SELECT 1 FROM user u JOIN role_assignment r ON r.user_id=u.id
      WHERE u.id=NEW.ended_by AND u.email_verified=1 AND r.role='membership-administrator'
    )))
    OR (NEW.status='collision' AND NEW.ended_by != NEW.target_user_id)
    THEN RAISE(ABORT,'Invalid email change transition') END;
END;

CREATE TRIGGER email_change_request_apply AFTER UPDATE ON email_change_request
WHEN NEW.status='completed' BEGIN
  UPDATE user SET email=NEW.new_email, email_verified=1,
    updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
    WHERE id=NEW.target_user_id;
  DELETE FROM session WHERE user_id=NEW.target_user_id;
END;

CREATE TRIGGER email_change_request_retain BEFORE DELETE ON email_change_request BEGIN
  SELECT RAISE(ABORT,'Email change history must be retained');
END;
