-- Existing free-text locations remain untouched. Convert known values when read;
-- the next owner save writes escaped, comma-separated canonical selections.
ALTER TABLE expertise_profile ADD COLUMN location_format INTEGER NOT NULL DEFAULT 0 CHECK(location_format IN (0,1));
