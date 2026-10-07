-- The later manual deletion workflow will set this marker; search excludes it immediately.
ALTER TABLE expertise_profile ADD COLUMN deletion_requested_at TEXT;

CREATE TABLE expertise_tag (
 id TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL COLLATE NOCASE UNIQUE,
 retired INTEGER NOT NULL DEFAULT 0 CHECK(retired IN(0,1)), version INTEGER NOT NULL DEFAULT 0,
 replacement_id TEXT REFERENCES expertise_tag(id)
);
INSERT INTO expertise_tag(id,label) VALUES ('education','Pendidikan'),('technology','Teknologi'),('science','Sains'),('arts','Seni'),('business','Bisnis'),('health','Kesehatan'),('communication','Komunikasi');
CREATE TABLE expertise_tag_event (
 id TEXT PRIMARY KEY NOT NULL, actor_user_id TEXT NOT NULL REFERENCES user(id),
 action TEXT NOT NULL CHECK(action IN('add','rename','retire','replace')),
 tag_id TEXT NOT NULL, label TEXT NOT NULL, expected_version INTEGER NOT NULL,
 replacement_id TEXT, occurred_at TEXT NOT NULL
);
CREATE TRIGGER expertise_tag_event_apply BEFORE INSERT ON expertise_tag_event BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_assignment WHERE user_id=NEW.actor_user_id AND role='directory-coordinator') THEN RAISE(ABORT,'Coordinator required') END;
 SELECT CASE WHEN NEW.action != 'add' AND NOT EXISTS(SELECT 1 FROM expertise_tag WHERE id=NEW.tag_id AND version=NEW.expected_version AND retired=0) THEN RAISE(ABORT,'Tag changed') END;
 INSERT INTO expertise_tag(id,label) SELECT NEW.tag_id,NEW.label WHERE NEW.action='add';
 INSERT INTO expertise_tag(id,label) SELECT NEW.replacement_id,NEW.label WHERE NEW.action='replace';
 UPDATE expertise_tag SET label=NEW.label,version=version+1 WHERE id=NEW.tag_id AND NEW.action='rename';
 UPDATE expertise_tag SET retired=1,version=version+1,replacement_id=NEW.replacement_id WHERE id=NEW.tag_id AND NEW.action IN('retire','replace');
END;
