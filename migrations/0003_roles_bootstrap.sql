-- Triggers keep each state change and audit event in one atomic statement.
CREATE TABLE role_assignment (
  user_id TEXT NOT NULL REFERENCES user(id),
  role TEXT NOT NULL CHECK (role IN ('membership-administrator','finance-coordinator','directory-coordinator','staff','student')),
  PRIMARY KEY (user_id, role)
);
CREATE TABLE alumni_membership (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id),
  status TEXT NOT NULL CHECK (status IN ('approved','suspended')),
  house TEXT NOT NULL CHECK (house IN ('Komodo','Lion','Rhino','Hornbill','Dove','Eagle','Dolphin','Shark','Mantaray'))
);
CREATE TABLE organization_bootstrap (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  primary_user_id TEXT NOT NULL REFERENCES user(id),
  operator TEXT NOT NULL CHECK (length(trim(operator)) BETWEEN 1 AND 200),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  trusted_alumni TEXT NOT NULL CHECK (json_valid(trusted_alumni) AND json_type(trusted_alumni) = 'array'),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE authorization_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  target_user_id TEXT NOT NULL REFERENCES user(id),
  action TEXT NOT NULL CHECK (action IN ('bootstrap-primary','bootstrap-alumnus','grant','revoke')),
  role TEXT CHECK (role IN ('membership-administrator','finance-coordinator','directory-coordinator','staff','student')),
  house TEXT,
  operator TEXT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((action IN ('grant','revoke') AND role IS NOT NULL) OR action IN ('bootstrap-primary','bootstrap-alumnus'))
);
CREATE INDEX authorization_audit_time ON authorization_audit(occurred_at);
CREATE TRIGGER bootstrap_validate BEFORE INSERT ON organization_bootstrap BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.primary_user_id AND email_verified = 1)
    THEN RAISE(ABORT, 'Primary account must be email verified') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.trusted_alumni) a
    WHERE json_type(a.value) != 'object'
      OR json_type(a.value, '$.userId') IS NOT 'text'
      OR json_type(a.value, '$.house') IS NOT 'text'
      OR NOT EXISTS (SELECT 1 FROM user WHERE id = json_extract(a.value,'$.userId') AND email_verified = 1)
  ) THEN RAISE(ABORT, 'Trusted alumni must have verified accounts and one house') END;
END;
CREATE TRIGGER bootstrap_apply AFTER INSERT ON organization_bootstrap BEGIN
  INSERT INTO authorization_audit (id,actor_user_id,target_user_id,action,operator,reason,occurred_at)
    VALUES (lower(hex(randomblob(16))),NEW.primary_user_id,NEW.primary_user_id,'bootstrap-primary',NEW.operator,NEW.reason,NEW.occurred_at);
  INSERT INTO alumni_membership (user_id,status,house)
    SELECT json_extract(value,'$.userId'),'approved',json_extract(value,'$.house') FROM json_each(NEW.trusted_alumni);
  INSERT INTO authorization_audit (id,actor_user_id,target_user_id,action,house,operator,reason,occurred_at)
    SELECT lower(hex(randomblob(16))),NEW.primary_user_id,json_extract(value,'$.userId'),'bootstrap-alumnus',json_extract(value,'$.house'),NEW.operator,NEW.reason,NEW.occurred_at
    FROM json_each(NEW.trusted_alumni);
END;
CREATE TRIGGER role_change_validate BEFORE INSERT ON authorization_audit WHEN NEW.action IN ('grant','revoke') BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM organization_bootstrap b JOIN user u ON u.id = b.primary_user_id
    WHERE b.primary_user_id = NEW.actor_user_id AND u.email_verified = 1
  ) THEN RAISE(ABORT, 'Only primary administrator may change roles') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.target_user_id AND email_verified = 1)
    THEN RAISE(ABORT, 'Target account must be email verified') END;
END;
CREATE TRIGGER role_change_apply AFTER INSERT ON authorization_audit WHEN NEW.action IN ('grant','revoke') BEGIN
  INSERT OR IGNORE INTO role_assignment (user_id,role)
    SELECT NEW.target_user_id,NEW.role WHERE NEW.action = 'grant';
  DELETE FROM role_assignment WHERE user_id = NEW.target_user_id AND role = NEW.role AND NEW.action = 'revoke';
END;
