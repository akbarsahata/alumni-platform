-- An operation and all derived versions/requests commit in one statement.
CREATE TABLE membership_recovery (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id),
 revision INTEGER NOT NULL,
 email TEXT,
 explanation TEXT NOT NULL CHECK(length(trim(explanation)) BETWEEN 1 AND 1000),
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(user_id,revision),
 FOREIGN KEY(user_id,revision) REFERENCES membership_revision(user_id,revision)
);
CREATE TRIGGER membership_recovery_validate BEFORE INSERT ON membership_recovery BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM membership_application a JOIN membership_revision r ON r.user_id=a.user_id AND r.revision=a.revision
   WHERE a.user_id=NEW.user_id AND a.revision=NEW.revision AND a.status='pending' AND r.student_type='graduate')
   OR NOT EXISTS(SELECT 1 FROM membership_reference WHERE user_id=NEW.user_id AND revision=NEW.revision)
   OR EXISTS(SELECT 1 FROM alumni_membership WHERE user_id=NEW.user_id)
 THEN RAISE(ABORT,'Recovery requires current applicant reference') END;
END;
CREATE TRIGGER membership_recovery_apply AFTER INSERT ON membership_recovery BEGIN
 INSERT INTO membership_revision(user_id,revision,school_name,student_type,graduation_year,attendance_start,attendance_end,house,explanation)
 SELECT r.user_id,r.revision+1,r.school_name,r.student_type,r.graduation_year,r.attendance_start,r.attendance_end,r.house,NEW.explanation
 FROM membership_revision r WHERE r.user_id=NEW.user_id AND r.revision=NEW.revision;
 INSERT INTO membership_reference(id,user_id,revision,to_email)
 SELECT NEW.id,NEW.user_id,NEW.revision+1,NEW.email WHERE NEW.email IS NOT NULL;
END;

-- A house correction includes a new independent approval; no intermediate state escapes.
CREATE TABLE membership_house_correction (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id),
 revision INTEGER NOT NULL,
 actor_user_id TEXT NOT NULL REFERENCES user(id),
 old_house TEXT NOT NULL,
 house TEXT NOT NULL CHECK(house IN ('Komodo','Lion','Rhino','Hornbill','Dove','Eagle','Dolphin','Shark','Mantaray')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 applicant_message TEXT NOT NULL CHECK(length(trim(applicant_message)) BETWEEN 1 AND 1000),
 check_source TEXT NOT NULL CHECK(check_source IN ('trusted-alumnus','school-staff')),
 check_note TEXT NOT NULL CHECK(length(trim(check_note)) BETWEEN 1 AND 1000),
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(user_id,revision),
 CHECK(actor_user_id != user_id AND old_house != house)
);
CREATE TRIGGER membership_house_correction_validate BEFORE INSERT ON membership_house_correction BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment a JOIN user u ON u.id=a.user_id AND u.email_verified=1
   WHERE a.user_id=NEW.actor_user_id AND a.role='membership-administrator')
 OR NOT EXISTS(SELECT 1 FROM alumni_membership m LEFT JOIN membership_application a ON a.user_id=m.user_id
   WHERE m.user_id=NEW.user_id AND m.status='approved' AND m.house=NEW.old_house
   AND ((a.status='approved' AND a.revision=NEW.revision) OR (a.user_id IS NULL AND NEW.revision=(SELECT count(*) FROM membership_house_correction WHERE user_id=NEW.user_id))))
 OR EXISTS(SELECT 1 FROM membership_reference q JOIN membership_reference_response s ON s.request_id=q.id
   WHERE q.user_id=NEW.user_id AND s.actor_user_id=NEW.actor_user_id AND s.outcome='endorse')
 THEN RAISE(ABORT,'Correction requires current independent review') END;
END;
CREATE TRIGGER membership_house_correction_apply AFTER INSERT ON membership_house_correction BEGIN
 DELETE FROM alumni_membership WHERE user_id=NEW.user_id
 AND EXISTS(SELECT 1 FROM membership_application WHERE user_id=NEW.user_id);
 UPDATE membership_application SET status='pending' WHERE user_id=NEW.user_id;
 INSERT INTO membership_revision(user_id,revision,school_name,student_type,graduation_year,attendance_start,attendance_end,house,explanation)
 SELECT user_id,revision+1,school_name,student_type,graduation_year,attendance_start,attendance_end,NEW.house,explanation
 FROM membership_revision WHERE user_id=NEW.user_id AND revision=NEW.revision;
 INSERT INTO membership_decision(id,user_id,revision,actor_user_id,outcome,reason,applicant_message,check_source,check_note)
 SELECT NEW.id,NEW.user_id,NEW.revision+1,NEW.actor_user_id,'approved',NEW.reason,NEW.applicant_message,NEW.check_source,NEW.check_note
 WHERE EXISTS(SELECT 1 FROM membership_application WHERE user_id=NEW.user_id);
 UPDATE alumni_membership SET house=NEW.house WHERE user_id=NEW.user_id
 AND NOT EXISTS(SELECT 1 FROM membership_application WHERE user_id=NEW.user_id);
 INSERT INTO membership_notification(id,user_id,to_email,kind,message)
 SELECT NEW.id,NEW.user_id,email,'approved',NEW.applicant_message FROM user
 WHERE id=NEW.user_id AND NOT EXISTS(SELECT 1 FROM membership_application WHERE user_id=NEW.user_id);
END;
