-- Migrators run this file in one transaction. Lock before replacing any
-- relationship constraint so all writers wait until capture/bootstrap commit.
LOCK TABLE public."read-it-later_article", public."read-it-later_highlight", public."read-it-later_note"
  IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- These legacy web-anchor fields existed in Drizzle/db:push deployments but
-- were absent from the canonical migration chain. Add them for fresh installs,
-- retaining existing columns, values and enum identities on upgraded databases.
DO $$
BEGIN
  CREATE TYPE public.highlight_anchor_status AS ENUM ('anchored', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
--> statement-breakpoint
ALTER TABLE public."read-it-later_highlight"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "anchorContentHash" text,
  ADD COLUMN IF NOT EXISTS "anchor_status" public.highlight_anchor_status NOT NULL DEFAULT 'anchored';
--> statement-breakpoint
-- 0002 removed the original cascade FKs; 0016 restored ownership with
-- NO ACTION. Replace only those ownership constraints with the same composite
-- keys and CASCADE. NOT VALID preserves all historical rows, including invalid
-- legacy relationships; a new cascade matches owner AND parent, never just id.
-- The migration transaction holds the graph locks throughout replacement.
ALTER TABLE public."read-it-later_highlight"
  DROP CONSTRAINT highlight_article_owner_fk,
  ADD CONSTRAINT highlight_article_owner_fk
    FOREIGN KEY ("articleId", "userId")
    REFERENCES public."read-it-later_article" (id, "userId")
    ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE public."read-it-later_note"
  DROP CONSTRAINT note_article_owner_fk,
  DROP CONSTRAINT note_highlight_owner_article_fk,
  ADD CONSTRAINT note_article_owner_fk
    FOREIGN KEY ("articleId", "userId")
    REFERENCES public."read-it-later_article" (id, "userId")
    ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT note_highlight_owner_article_fk
    FOREIGN KEY ("highlightId", "userId", "articleId")
    REFERENCES public."read-it-later_highlight" (id, "userId", "articleId")
    ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
-- Child identities are retained independently of physical rows. A relationship
-- move leaves a tombstone at the old parent and a live identity at the new one.
-- No FK to articles/annotations: cascades must not erase recovery information.
CREATE TABLE public."read-it-later_native_annotation" (
  owner_id text NOT NULL REFERENCES public."read-it-later_native_library_owner"(owner_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note', 'highlight')),
  id uuid NOT NULL,
  article_id uuid NOT NULL,
  deleted boolean NOT NULL,
  PRIMARY KEY (owner_id, kind, id, article_id)
);
--> statement-breakpoint
CREATE INDEX native_annotation_article_idx
  ON public."read-it-later_native_annotation" (owner_id, article_id);
--> statement-breakpoint
ALTER TABLE public."read-it-later_highlight"
  ADD COLUMN "anchorSpace" text NOT NULL DEFAULT 'web-dom-v1'
    CHECK ("anchorSpace" IN ('web-dom-v1', 'paper-drive-text-v1', 'local-text-v1')),
  ADD COLUMN "sourceAnchor" jsonb,
  ADD COLUMN "webAnchor" jsonb;
--> statement-breakpoint
CREATE FUNCTION public.native_annotation_touch_parent(owner_key text, article_key uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE next_revision bigint;
BEGIN
  -- In an article cascade the parent is already absent; in a delayed child
  -- trigger its ledger may already be deleted. Neither case may resurrect it.
  IF NOT EXISTS (SELECT 1 FROM public."read-it-later_article"
      WHERE id = article_key AND "userId" = owner_key) THEN RETURN; END IF;
  INSERT INTO public."read-it-later_native_library_owner" (owner_id)
    VALUES (owner_key) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public."read-it-later_native_library_owner"
    WHERE owner_id = owner_key FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public."read-it-later_native_library_change"
      WHERE owner_id = owner_key AND article_id = article_key AND deleted) THEN RETURN; END IF;
  UPDATE public."read-it-later_native_library_owner" SET revision = revision + 1
    WHERE owner_id = owner_key RETURNING revision INTO next_revision;
  INSERT INTO public."read-it-later_native_library_change" (owner_id, article_id, revision, deleted)
    VALUES (owner_key, article_key, next_revision, false)
    ON CONFLICT (owner_id, article_id) DO UPDATE
      SET revision = EXCLUDED.revision WHERE NOT "read-it-later_native_library_change".deleted;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.native_annotation_capture() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE annotation_kind text; new_valid boolean := false;
BEGIN
  annotation_kind := CASE TG_TABLE_NAME WHEN 'read-it-later_note' THEN 'note' ELSE 'highlight' END;
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Annotation identity is immutable' USING ERRCODE = '23514';
  END IF;
  -- Serialize through precisely the same owner counter used by article writers
  -- and native receipts. Lock both owners in a deterministic order on moves.
  IF TG_OP <> 'INSERT' THEN
    INSERT INTO public."read-it-later_native_library_owner" (owner_id) VALUES (OLD."userId") ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO public."read-it-later_native_library_owner" (owner_id) VALUES (NEW."userId") ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM 1 FROM public."read-it-later_native_library_owner"
      WHERE owner_id IN (OLD."userId", NEW."userId") ORDER BY owner_id FOR UPDATE;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM public."read-it-later_native_library_owner" WHERE owner_id = OLD."userId" FOR UPDATE;
  ELSE
    PERFORM 1 FROM public."read-it-later_native_library_owner" WHERE owner_id = NEW."userId" FOR UPDATE;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF TG_OP = 'INSERT' AND EXISTS (
      SELECT 1 FROM public."read-it-later_native_annotation"
      WHERE owner_id = NEW."userId" AND kind = annotation_kind AND id = NEW.id AND deleted
    ) THEN
      RAISE EXCEPTION 'Deleted annotation identity cannot be reused' USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public."read-it-later_article"
      WHERE id = NEW."articleId" AND "userId" = NEW."userId") INTO new_valid;
    IF annotation_kind = 'note' AND new_valid THEN
      new_valid := NEW."highlightId" IS NULL OR EXISTS (
        SELECT 1 FROM public."read-it-later_highlight"
        WHERE id = NEW."highlightId" AND "userId" = NEW."userId" AND "articleId" = NEW."articleId");
    END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    -- OLD is essential: NEW has no identity in DELETE/cascade triggers. Preserve
    -- deletions even for legacy invalid relationships, without exporting content.
    IF TG_OP = 'DELETE' OR OLD."userId" IS DISTINCT FROM NEW."userId"
      OR OLD."articleId" IS DISTINCT FROM NEW."articleId" OR NOT new_valid THEN
      INSERT INTO public."read-it-later_native_annotation" (owner_id, kind, id, article_id, deleted)
        VALUES (OLD."userId", annotation_kind, OLD.id, OLD."articleId", true)
        ON CONFLICT (owner_id, kind, id, article_id) DO UPDATE SET deleted = true;
      PERFORM public.native_annotation_touch_parent(OLD."userId", OLD."articleId");
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND new_valid THEN
    INSERT INTO public."read-it-later_native_annotation" (owner_id, kind, id, article_id, deleted)
      VALUES (NEW."userId", annotation_kind, NEW.id, NEW."articleId", false)
      ON CONFLICT (owner_id, kind, id, article_id) DO UPDATE SET deleted = false;
    PERFORM public.native_annotation_touch_parent(NEW."userId", NEW."articleId");
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
INSERT INTO public."read-it-later_native_annotation" (owner_id, kind, id, article_id, deleted)
  SELECT h."userId", 'highlight', h.id, h."articleId", false
  FROM public."read-it-later_highlight" h
  JOIN public."read-it-later_article" a ON a.id = h."articleId" AND a."userId" = h."userId";
--> statement-breakpoint
INSERT INTO public."read-it-later_native_annotation" (owner_id, kind, id, article_id, deleted)
  SELECT n."userId", 'note', n.id, n."articleId", false
  FROM public."read-it-later_note" n
  JOIN public."read-it-later_article" a ON a.id = n."articleId" AND a."userId" = n."userId"
  WHERE n."highlightId" IS NULL OR EXISTS (
    SELECT 1 FROM public."read-it-later_highlight" h
    WHERE h.id = n."highlightId" AND h."userId" = n."userId" AND h."articleId" = n."articleId");
--> statement-breakpoint
CREATE TRIGGER native_annotation_highlight_change AFTER INSERT OR UPDATE OR DELETE
  ON public."read-it-later_highlight" FOR EACH ROW EXECUTE FUNCTION public.native_annotation_capture();
--> statement-breakpoint
CREATE TRIGGER native_annotation_note_change AFTER INSERT OR UPDATE OR DELETE
  ON public."read-it-later_note" FOR EACH ROW EXECUTE FUNCTION public.native_annotation_capture();
