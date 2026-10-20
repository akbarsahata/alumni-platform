-- Invitation names are nullable only for records issued before this migration.
-- New invitations require a trimmed 1-200 character name through the shared schema.
ALTER TABLE school_invitation ADD COLUMN representative_name TEXT
  CHECK (representative_name IS NULL OR (
    length(trim(representative_name)) BETWEEN 1 AND 200
    AND representative_name = trim(representative_name)
  ));

DROP TRIGGER school_invitation_issue;
CREATE TRIGGER school_invitation_issue BEFORE INSERT ON school_invitation BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM organization_bootstrap WHERE primary_user_id = NEW.issuer_id)
    OR NEW.accepted_by IS NOT NULL
    OR (NEW.representative_name IS NOT NULL AND (
      length(trim(NEW.representative_name)) NOT BETWEEN 1 AND 200
      OR NEW.representative_name != trim(NEW.representative_name)
    ))
    THEN RAISE(ABORT,'Invalid invitation issuer') END;
END;

DROP TRIGGER school_invitation_accept;
CREATE TRIGGER school_invitation_accept BEFORE UPDATE ON school_invitation BEGIN
  SELECT CASE WHEN OLD.accepted_by IS NOT NULL OR NEW.id != OLD.id OR NEW.email != OLD.email
    OR NEW.role != OLD.role OR NEW.issuer_id != OLD.issuer_id OR NEW.reason != OLD.reason
    OR NEW.issued_at != OLD.issued_at OR NEW.expires_at != OLD.expires_at
    OR NEW.representative_name IS NOT OLD.representative_name
    OR NEW.accepted_at IS NULL OR NEW.accepted_at >= OLD.expires_at
    OR NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.accepted_by AND email_verified = 1 AND lower(email) = OLD.email)
    THEN RAISE(ABORT,'Invalid invitation acceptance') END;
END;

-- Acceptance consumes the invitation, grants the stored role and establishes the
-- invited name for an otherwise unnamed account in the same statement.
DROP TRIGGER school_invitation_apply;
CREATE TRIGGER school_invitation_apply AFTER UPDATE ON school_invitation BEGIN
  UPDATE user SET name=trim(NEW.representative_name),
    updated_at=CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE id=NEW.accepted_by AND NEW.representative_name IS NOT NULL
    AND NULLIF(trim(name),'') IS NULL;
  INSERT INTO authorization_audit (id,actor_user_id,target_user_id,action,role,reason,occurred_at)
    SELECT lower(hex(randomblob(16))),NEW.issuer_id,NEW.accepted_by,'grant',NEW.role,NEW.reason,NEW.accepted_at
    WHERE NOT EXISTS (SELECT 1 FROM role_assignment WHERE user_id = NEW.accepted_by AND role = NEW.role);
END;

CREATE TABLE representative_name_change (
  id TEXT PRIMARY KEY NOT NULL,
  target_user_id TEXT NOT NULL REFERENCES user(id),
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  old_name TEXT NOT NULL,
  new_name TEXT NOT NULL CHECK (
    length(trim(new_name)) BETWEEN 1 AND 200
    AND new_name = trim(new_name)
  ),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX representative_name_change_time ON representative_name_change(occurred_at);

CREATE TRIGGER representative_name_change_validate BEFORE INSERT ON representative_name_change BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM organization_bootstrap b JOIN user a ON a.id=b.primary_user_id
    WHERE b.primary_user_id=NEW.actor_user_id AND a.email_verified=1
  )
    OR NOT EXISTS (
      SELECT 1 FROM user u WHERE u.id=NEW.target_user_id AND u.email_verified=1
        AND EXISTS(SELECT 1 FROM role_assignment r
          WHERE r.user_id=u.id AND r.role IN('staff','student'))
    )
    OR NEW.old_name != COALESCE((SELECT trim(name) FROM user WHERE id=NEW.target_user_id),'')
    OR NEW.new_name = NEW.old_name
    THEN RAISE(ABORT,'Invalid representative name change') END;
END;

CREATE TRIGGER representative_name_change_apply AFTER INSERT ON representative_name_change BEGIN
  UPDATE user SET name=NEW.new_name,
    updated_at=CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE id=NEW.target_user_id AND COALESCE(trim(name),'')=NEW.old_name;
END;

CREATE TRIGGER representative_name_change_retain BEFORE UPDATE ON representative_name_change BEGIN
  SELECT RAISE(ABORT,'Representative name history must be retained');
END;

CREATE TRIGGER representative_name_change_retain_delete BEFORE DELETE ON representative_name_change BEGIN
  SELECT RAISE(ABORT,'Representative name history must be retained');
END;
