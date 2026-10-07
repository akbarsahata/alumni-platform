CREATE TABLE expertise_profile (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id),
 display_name TEXT NOT NULL DEFAULT '', introduction TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', availability_note TEXT NOT NULL DEFAULT '',
 expertise_tags TEXT NOT NULL CHECK(json_valid(expertise_tags) AND json_type(expertise_tags) = 'array'),
 help_types TEXT NOT NULL CHECK(json_valid(help_types) AND json_type(help_types) = 'array'),
 availability TEXT CHECK(availability IN ('available','limited','unavailable')),
 participation INTEGER NOT NULL DEFAULT 0 CHECK(participation IN (0,1)),
 confirmed_at TEXT NOT NULL,
 CHECK(participation = 0 OR (json_array_length(expertise_tags) > 0 AND json_array_length(help_types) > 0 AND availability IS NOT NULL))
);
-- Recheck membership atomically, including concurrent suspension.
CREATE TRIGGER profile_insert_authority BEFORE INSERT ON expertise_profile BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM alumni_membership WHERE user_id = NEW.user_id AND status = 'approved') THEN RAISE(ABORT,'Profile requires approved membership') END;
END;
CREATE TRIGGER profile_update_authority BEFORE UPDATE ON expertise_profile BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM alumni_membership WHERE user_id = NEW.user_id AND status = 'approved') THEN RAISE(ABORT,'Profile requires approved membership') END;
END;
