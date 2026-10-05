CREATE TABLE school_invitation (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('staff','student')),
  issuer_id TEXT NOT NULL REFERENCES user(id),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days')),
  accepted_by TEXT REFERENCES user(id),
  accepted_at TEXT,
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL))
);
CREATE TRIGGER school_invitation_issue BEFORE INSERT ON school_invitation BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM organization_bootstrap WHERE primary_user_id = NEW.issuer_id)
    OR NEW.accepted_by IS NOT NULL THEN RAISE(ABORT,'Invalid invitation issuer') END;
END;
CREATE TRIGGER school_invitation_accept BEFORE UPDATE ON school_invitation BEGIN
  SELECT CASE WHEN OLD.accepted_by IS NOT NULL OR NEW.id != OLD.id OR NEW.email != OLD.email
    OR NEW.role != OLD.role OR NEW.issuer_id != OLD.issuer_id OR NEW.reason != OLD.reason
    OR NEW.issued_at != OLD.issued_at OR NEW.expires_at != OLD.expires_at
    OR NEW.accepted_at IS NULL OR NEW.accepted_at >= OLD.expires_at
    OR NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.accepted_by AND email_verified = 1 AND lower(email) = OLD.email)
    THEN RAISE(ABORT,'Invalid invitation acceptance') END;
END;
CREATE TRIGGER school_invitation_apply AFTER UPDATE ON school_invitation BEGIN
  INSERT INTO authorization_audit (id,actor_user_id,target_user_id,action,role,reason,occurred_at)
    SELECT lower(hex(randomblob(16))),NEW.issuer_id,NEW.accepted_by,'grant',NEW.role,NEW.reason,NEW.accepted_at
    WHERE NOT EXISTS (SELECT 1 FROM role_assignment WHERE user_id = NEW.accepted_by AND role = NEW.role);
END;
CREATE TRIGGER school_invitation_retain BEFORE DELETE ON school_invitation BEGIN
  SELECT RAISE(ABORT,'Invitation history must be retained');
END;
