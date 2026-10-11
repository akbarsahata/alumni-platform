CREATE TABLE school_need (
 id TEXT PRIMARY KEY NOT NULL,
 submitter_user_id TEXT NOT NULL REFERENCES user(id),
 version INTEGER NOT NULL CHECK(version > 0),
 category TEXT NOT NULL CHECK(category IN('school-activity','student-mentoring')),
 title TEXT NOT NULL,
 purpose TEXT NOT NULL,
 requested_help TEXT NOT NULL,
 time_commitment TEXT NOT NULL,
 timing TEXT,
 deadline TEXT,
 location_mode TEXT NOT NULL CHECK(location_mode IN('remote','on-site')),
 location_details TEXT NOT NULL,
 staff_contact_user_id TEXT NOT NULL REFERENCES user(id),
 staff_contact_name TEXT NOT NULL CHECK(length(trim(staff_contact_name)) BETWEEN 1 AND 200),
 participation_terms TEXT NOT NULL CHECK(participation_terms IN('voluntary','paid')),
 paid_details TEXT NOT NULL,
 initiative_link TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES user(id)
);

CREATE TABLE school_need_revision (
 need_id TEXT NOT NULL REFERENCES school_need(id),
 version INTEGER NOT NULL CHECK(version > 0),
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 category TEXT NOT NULL CHECK(category IN('school-activity','student-mentoring')),
 title TEXT NOT NULL,
 purpose TEXT NOT NULL,
 requested_help TEXT NOT NULL,
 time_commitment TEXT NOT NULL,
 timing TEXT,
 deadline TEXT,
 location_mode TEXT NOT NULL CHECK(location_mode IN('remote','on-site')),
 location_details TEXT NOT NULL,
 staff_contact_user_id TEXT NOT NULL REFERENCES user(id),
 staff_contact_name TEXT NOT NULL CHECK(length(trim(staff_contact_name)) BETWEEN 1 AND 200),
 participation_terms TEXT NOT NULL CHECK(participation_terms IN('voluntary','paid')),
 paid_details TEXT NOT NULL,
 initiative_link TEXT,
 created_at TEXT NOT NULL,
 PRIMARY KEY(need_id, version)
);

CREATE TABLE school_need_approval (
 need_id TEXT NOT NULL REFERENCES school_need(id),
 version INTEGER NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN('staff-validation','directory-approval')),
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 approved_at TEXT NOT NULL,
 PRIMARY KEY(need_id, version, stage),
 FOREIGN KEY(need_id, version) REFERENCES school_need_revision(need_id, version)
);

CREATE TABLE school_need_audit (
 id TEXT PRIMARY KEY NOT NULL,
 need_id TEXT NOT NULL REFERENCES school_need(id),
 version INTEGER NOT NULL,
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 action TEXT NOT NULL CHECK(action IN('submitted','edited','staff-validated','outreach-approved')),
 occurred_at TEXT NOT NULL
);

CREATE INDEX school_need_submitter ON school_need(submitter_user_id, updated_at DESC);
CREATE INDEX school_need_staff_contact ON school_need(staff_contact_user_id, updated_at DESC);
CREATE INDEX school_need_approval_actor ON school_need_approval(actor_user_id, need_id);
CREATE INDEX school_need_audit_need ON school_need_audit(need_id, version);

CREATE TRIGGER school_need_insert_authority BEFORE INSERT ON school_need BEGIN
 SELECT CASE WHEN NEW.version != 1 OR NEW.updated_by != NEW.submitter_user_id
   THEN RAISE(ABORT,'Invalid school need submission') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment
   WHERE user_id=NEW.submitter_user_id AND role IN('staff','student','directory-coordinator'))
   THEN RAISE(ABORT,'School role required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment r JOIN user u ON u.id=r.user_id
   WHERE r.user_id=NEW.staff_contact_user_id AND r.role='staff'
   AND u.email_verified=1)
   THEN RAISE(ABORT,'Verified staff contact required') END;
END;

CREATE TRIGGER school_need_insert_history AFTER INSERT ON school_need BEGIN
 INSERT INTO school_need_revision(need_id,version,actor_user_id,category,title,purpose,requested_help,
   time_commitment,timing,deadline,location_mode,location_details,staff_contact_user_id,staff_contact_name,
   participation_terms,paid_details,initiative_link,created_at)
 VALUES(NEW.id,NEW.version,NEW.updated_by,NEW.category,NEW.title,NEW.purpose,NEW.requested_help,
   NEW.time_commitment,NEW.timing,NEW.deadline,NEW.location_mode,NEW.location_details,
   NEW.staff_contact_user_id,NEW.staff_contact_name,NEW.participation_terms,NEW.paid_details,
   NEW.initiative_link,NEW.updated_at);
 INSERT INTO school_need_audit(id,need_id,version,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.version,NEW.updated_by,'submitted',NEW.updated_at);
END;

CREATE TRIGGER school_need_update_authority BEFORE UPDATE ON school_need BEGIN
 SELECT CASE WHEN NEW.id != OLD.id OR NEW.submitter_user_id != OLD.submitter_user_id
   OR NEW.created_at != OLD.created_at OR NEW.version != OLD.version+1
   OR NEW.updated_by != OLD.submitter_user_id
   THEN RAISE(ABORT,'Invalid school need revision') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment
   WHERE user_id=NEW.updated_by AND role IN('staff','student','directory-coordinator'))
   THEN RAISE(ABORT,'School role required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment r JOIN user u ON u.id=r.user_id
   WHERE r.user_id=NEW.staff_contact_user_id AND r.role='staff'
   AND u.email_verified=1)
   THEN RAISE(ABORT,'Verified staff contact required') END;
END;

CREATE TRIGGER school_need_update_history AFTER UPDATE ON school_need BEGIN
 INSERT INTO school_need_revision(need_id,version,actor_user_id,category,title,purpose,requested_help,
   time_commitment,timing,deadline,location_mode,location_details,staff_contact_user_id,staff_contact_name,
   participation_terms,paid_details,initiative_link,created_at)
 VALUES(NEW.id,NEW.version,NEW.updated_by,NEW.category,NEW.title,NEW.purpose,NEW.requested_help,
   NEW.time_commitment,NEW.timing,NEW.deadline,NEW.location_mode,NEW.location_details,
   NEW.staff_contact_user_id,NEW.staff_contact_name,NEW.participation_terms,NEW.paid_details,
   NEW.initiative_link,NEW.updated_at);
 INSERT INTO school_need_audit(id,need_id,version,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.version,NEW.updated_by,'edited',NEW.updated_at);
END;

CREATE TRIGGER school_need_approval_authority BEFORE INSERT ON school_need_approval BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM school_need n JOIN school_need_revision v
   ON v.need_id=n.id AND v.version=n.version WHERE n.id=NEW.need_id AND n.version=NEW.version)
   THEN RAISE(ABORT,'School need revision changed') END;
 SELECT CASE WHEN NEW.stage='staff-validation' AND
   (NOT EXISTS(SELECT 1 FROM school_need_revision v JOIN role_assignment r
      ON r.user_id=NEW.actor_user_id AND r.role='staff' JOIN user u ON u.id=r.user_id
      WHERE v.need_id=NEW.need_id AND v.version=NEW.version
      AND v.staff_contact_user_id=NEW.actor_user_id AND u.email_verified=1))
   THEN RAISE(ABORT,'Named verified staff representative required') END;
 SELECT CASE WHEN NEW.stage='directory-approval' AND NOT EXISTS(
   SELECT 1 FROM role_assignment WHERE user_id=NEW.actor_user_id AND role='directory-coordinator')
   THEN RAISE(ABORT,'Directory coordinator required') END;
 SELECT CASE WHEN NEW.stage='directory-approval' AND NOT EXISTS(
   SELECT 1 FROM school_need_approval WHERE need_id=NEW.need_id AND version=NEW.version
     AND stage='staff-validation')
   THEN RAISE(ABORT,'Staff validation required') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=NEW.need_id
   AND a.version=NEW.version AND a.actor_user_id=NEW.actor_user_id AND a.stage!=NEW.stage)
   THEN RAISE(ABORT,'Approvals must be independent') END;
END;

CREATE TRIGGER school_need_approval_history AFTER INSERT ON school_need_approval BEGIN
 INSERT INTO school_need_audit(id,need_id,version,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.version,NEW.actor_user_id,
   CASE NEW.stage WHEN 'staff-validation' THEN 'staff-validated' ELSE 'outreach-approved' END,
   NEW.approved_at);
END;
