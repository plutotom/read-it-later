-- Compact current-state ledger. Revisions are owner-local, allocated while
-- holding the owner row lock until COMMIT (not a sequence/commit-time guess).
CREATE TABLE "read-it-later_native_library_owner" (
  "owner_id" text PRIMARY KEY REFERENCES "read-it-later_user"("id") ON DELETE CASCADE,
  "revision" bigint NOT NULL DEFAULT 0 CHECK ("revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "read-it-later_native_library_change" (
  "owner_id" text NOT NULL REFERENCES "read-it-later_native_library_owner"("owner_id") ON DELETE CASCADE,
  "article_id" uuid NOT NULL,
  "revision" bigint NOT NULL CHECK ("revision" > 0),
  "deleted" boolean NOT NULL,
  PRIMARY KEY ("owner_id", "article_id"),
  UNIQUE ("owner_id", "revision")
);
--> statement-breakpoint
CREATE TABLE "read-it-later_native_library_mutation" (
  "owner_id" text NOT NULL REFERENCES "read-it-later_native_library_owner"("owner_id") ON DELETE CASCADE,
  "mutation_id" uuid NOT NULL,
  "input_hash" text NOT NULL,
  "result" jsonb NOT NULL,
  PRIMARY KEY ("owner_id", "mutation_id")
);
--> statement-breakpoint
-- Preserve a successful URL-deduplication mapping even when its ACK is lost.
CREATE TABLE "read-it-later_native_library_alias" (
  "owner_id" text NOT NULL REFERENCES "read-it-later_native_library_owner"("owner_id") ON DELETE CASCADE,
  "local_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  PRIMARY KEY ("owner_id", "local_id")
);
--> statement-breakpoint
CREATE FUNCTION native_library_capture_article() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE owner_key text; article_key uuid; next_revision bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Article ownership and identity are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    owner_key := OLD."userId"; article_key := OLD.id;
  ELSE
    owner_key := NEW."userId"; article_key := NEW.id;
  END IF;
  INSERT INTO "read-it-later_native_library_owner" (owner_id) VALUES (owner_key)
    ON CONFLICT DO NOTHING;
  -- Every writer (including existing web, tRPC, REST and MCP) waits here.
  UPDATE "read-it-later_native_library_owner" SET revision = revision + 1
    WHERE owner_id = owner_key RETURNING revision INTO next_revision;
  IF TG_OP <> 'DELETE' AND EXISTS (
    SELECT 1 FROM "read-it-later_native_library_change"
    WHERE owner_id = owner_key AND article_id = article_key AND deleted
  ) THEN
    RAISE EXCEPTION 'Deleted article identity cannot be reused' USING ERRCODE = '23514';
  END IF;
  INSERT INTO "read-it-later_native_library_change" (owner_id, article_id, revision, deleted)
    VALUES (owner_key, article_key, next_revision, TG_OP = 'DELETE')
    ON CONFLICT (owner_id, article_id) DO UPDATE
      SET revision = EXCLUDED.revision, deleted = EXCLUDED.deleted;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Migrators run these statements in one transaction. Block writers until both
-- bootstrap and trigger installation commit, eliminating the bootstrap gap.
LOCK TABLE "read-it-later_article" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
INSERT INTO "read-it-later_native_library_owner" (owner_id, revision)
  SELECT "userId", count(*) FROM "read-it-later_article" GROUP BY "userId";
--> statement-breakpoint
INSERT INTO "read-it-later_native_library_change" (owner_id, article_id, revision, deleted)
  SELECT "userId", id, row_number() OVER (PARTITION BY "userId" ORDER BY id), false
  FROM "read-it-later_article";
--> statement-breakpoint
CREATE TRIGGER native_library_article_change AFTER INSERT OR UPDATE OR DELETE
  ON "read-it-later_article" FOR EACH ROW EXECUTE FUNCTION native_library_capture_article();
