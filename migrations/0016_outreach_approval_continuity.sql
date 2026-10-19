-- Approval authority was checked when its immutable evidence was recorded.
-- Later coordinator departure must not invalidate organization-owned requests.
-- Sending/delivery still require an active coordinator and current staff contact.
DROP VIEW outreach_approved_need;
CREATE VIEW outreach_approved_need AS
 SELECT n.id FROM school_need n
 JOIN school_need_approval s ON s.need_id=n.id AND s.version=n.version AND s.stage='staff-validation'
 JOIN school_need_approval c ON c.need_id=n.id AND c.version=n.version AND c.stage='directory-approval'
 JOIN role_assignment sr ON sr.user_id=s.actor_user_id AND sr.role='staff'
 JOIN user u ON u.id=n.staff_contact_user_id
 WHERE s.actor_user_id=n.staff_contact_user_id AND s.actor_user_id!=c.actor_user_id
 AND u.email_verified=1 AND NOT EXISTS(SELECT 1 FROM outreach_closure x WHERE x.need_id=n.id);
