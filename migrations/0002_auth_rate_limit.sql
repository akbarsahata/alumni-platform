CREATE TABLE "rate_limit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "last_request" INTEGER NOT NULL
);
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
