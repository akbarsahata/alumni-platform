DROP TRIGGER school_need_insert_authority;
DROP TRIGGER school_need_update_authority;

CREATE TRIGGER school_need_insert_authority BEFORE INSERT ON school_need BEGIN
 SELECT CASE WHEN NEW.version != 1 OR NEW.updated_by != NEW.submitter_user_id
   THEN RAISE(ABORT,'Invalid school need submission') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment
   WHERE user_id=NEW.submitter_user_id AND role IN('staff','student','directory-coordinator'))
   THEN RAISE(ABORT,'School role required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment r JOIN user u ON u.id=r.user_id
   WHERE r.user_id=NEW.staff_contact_user_id AND r.role='staff'
   AND u.email_verified=1
   AND NEW.staff_contact_name=COALESCE(NULLIF(trim(u.name),''),'Akun staf ' || substr(u.id,1,8)))
   THEN RAISE(ABORT,'Verified staff contact required') END;
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
   AND u.email_verified=1
   AND NEW.staff_contact_name=COALESCE(NULLIF(trim(u.name),''),'Akun staf ' || substr(u.id,1,8)))
   THEN RAISE(ABORT,'Verified staff contact required') END;
END;
