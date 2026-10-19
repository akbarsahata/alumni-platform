-- The named staff recipient for introductions is current workflow state, not a
-- rewrite of the historical school-need validation. A sent need keeps its
-- original approval evidence; replacement changes only who can receive a
-- consented introduction from this point onward.
CREATE TABLE outreach_staff_recipient (
 need_id TEXT PRIMARY KEY REFERENCES school_need(id),
 user_id TEXT NOT NULL REFERENCES user(id),
 assigned_by TEXT NOT NULL REFERENCES user(id),
 assigned_at TEXT NOT NULL
);
CREATE INDEX outreach_staff_recipient_user ON outreach_staff_recipient(user_id);

INSERT INTO outreach_staff_recipient(need_id,user_id,assigned_by,assigned_at)
SELECT n.id,n.staff_contact_user_id,
 (SELECT r.coordinator_user_id FROM outreach_request r
   WHERE r.need_id=n.id ORDER BY r.sent_at,r.id LIMIT 1),
 (SELECT r.sent_at FROM outreach_request r
   WHERE r.need_id=n.id ORDER BY r.sent_at,r.id LIMIT 1)
FROM school_need n
WHERE EXISTS(SELECT 1 FROM outreach_request r WHERE r.need_id=n.id);

CREATE TRIGGER outreach_initialize_staff_recipient AFTER INSERT ON outreach_request BEGIN
 INSERT OR IGNORE INTO outreach_staff_recipient(need_id,user_id,assigned_by,assigned_at)
 SELECT NEW.need_id,n.staff_contact_user_id,NEW.coordinator_user_id,NEW.sent_at
 FROM school_need n WHERE n.id=NEW.need_id;
END;

-- Sending and member-notification delivery require an active coordinator and a
-- current named staff recipient with a verified staff role. The staff-validation
-- approval remains historical evidence of the need content and its named contact
-- at approval time. When no recipient row exists yet (before the first request),
-- the original need contact remains the fallback.
DROP VIEW outreach_approved_need;
CREATE VIEW outreach_approved_need AS
 SELECT n.id FROM school_need n
 JOIN school_need_approval s ON s.need_id=n.id AND s.version=n.version AND s.stage='staff-validation'
 JOIN school_need_approval c ON c.need_id=n.id AND c.version=n.version AND c.stage='directory-approval'
 WHERE s.actor_user_id=n.staff_contact_user_id
 AND s.actor_user_id!=c.actor_user_id
 AND NOT EXISTS(SELECT 1 FROM outreach_closure x WHERE x.need_id=n.id)
 AND (
   EXISTS(SELECT 1 FROM outreach_staff_recipient r
     JOIN role_assignment rr ON rr.user_id=r.user_id AND rr.role='staff'
     JOIN user ru ON ru.id=r.user_id AND ru.email_verified=1
     WHERE r.need_id=n.id)
   OR (NOT EXISTS(SELECT 1 FROM outreach_staff_recipient r WHERE r.need_id=n.id)
     AND EXISTS(SELECT 1 FROM role_assignment rr JOIN user ru ON ru.id=rr.user_id
       WHERE rr.user_id=n.staff_contact_user_id AND rr.role='staff' AND ru.email_verified=1))
 );
