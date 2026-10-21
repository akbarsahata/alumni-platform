-- Private clarification messages belong to one outreach request. They are
-- member/coordinator records only: staff, students and general audit projections
-- never receive message text or author identity beyond the minimal audit event.
CREATE TABLE outreach_clarification (
 id TEXT PRIMARY KEY,
 need_id TEXT NOT NULL REFERENCES school_need(id),
 request_id TEXT NOT NULL REFERENCES outreach_request(id),
 author_user_id TEXT NOT NULL REFERENCES user(id),
 author_role TEXT NOT NULL CHECK(author_role IN('member','coordinator')),
 body TEXT NOT NULL CHECK(length(trim(body))>0),
 created_at TEXT NOT NULL
);

CREATE INDEX outreach_clarification_request
 ON outreach_clarification(request_id,created_at,id);

CREATE TRIGGER outreach_clarification_history AFTER INSERT ON outreach_clarification BEGIN
 INSERT INTO outreach_audit(id,need_id,actor_user_id,action,occurred_at)
 VALUES(lower(hex(randomblob(16))),NEW.need_id,NEW.author_user_id,'clarification-message',NEW.created_at);
END;
