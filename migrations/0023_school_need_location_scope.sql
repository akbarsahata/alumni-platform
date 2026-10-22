-- School needs can happen at school or at an external location. The stored
-- location_mode stays within the original on-site/remote vocabulary; the scope
-- distinguishes the school address from a manually entered external place.
ALTER TABLE school_need ADD COLUMN location_scope TEXT NOT NULL DEFAULT 'school'
 CHECK(location_scope IN('school','outside'));
ALTER TABLE school_need_revision ADD COLUMN location_scope TEXT NOT NULL DEFAULT 'school'
 CHECK(location_scope IN('school','outside'));

DROP TRIGGER school_need_insert_history;
DROP TRIGGER school_need_update_history;

CREATE TRIGGER school_need_insert_history AFTER INSERT ON school_need BEGIN
 INSERT INTO school_need_revision(need_id,version,actor_user_id,category,title,purpose,requested_help,
   time_commitment,timing,deadline,location_mode,location_scope,location_details,staff_contact_user_id,
   staff_contact_name,participation_terms,paid_details,initiative_link,created_at)
 VALUES(NEW.id,NEW.version,NEW.updated_by,NEW.category,NEW.title,NEW.purpose,NEW.requested_help,
   NEW.time_commitment,NEW.timing,NEW.deadline,NEW.location_mode,NEW.location_scope,NEW.location_details,
   NEW.staff_contact_user_id,NEW.staff_contact_name,NEW.participation_terms,NEW.paid_details,
   NEW.initiative_link,NEW.updated_at);
 INSERT INTO school_need_audit(id,need_id,version,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.version,NEW.updated_by,'submitted',NEW.updated_at);
END;

CREATE TRIGGER school_need_update_history AFTER UPDATE ON school_need BEGIN
 INSERT INTO school_need_revision(need_id,version,actor_user_id,category,title,purpose,requested_help,
   time_commitment,timing,deadline,location_mode,location_scope,location_details,staff_contact_user_id,
   staff_contact_name,participation_terms,paid_details,initiative_link,created_at)
 VALUES(NEW.id,NEW.version,NEW.updated_by,NEW.category,NEW.title,NEW.purpose,NEW.requested_help,
   NEW.time_commitment,NEW.timing,NEW.deadline,NEW.location_mode,NEW.location_scope,NEW.location_details,
   NEW.staff_contact_user_id,NEW.staff_contact_name,NEW.participation_terms,NEW.paid_details,
   NEW.initiative_link,NEW.updated_at);
 INSERT INTO school_need_audit(id,need_id,version,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.version,NEW.updated_by,'edited',NEW.updated_at);
END;
