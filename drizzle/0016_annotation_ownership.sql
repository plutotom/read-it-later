-- Forward-only ownership enforcement. No backfill, cleanup, or validation of
-- historical annotations: legacy rows remain intact, including on content-only
-- updates. INSERTs and actual relationship changes must satisfy the new rules.
-- These parent keys are unique already by id; the composite keys let PostgreSQL
-- enforce ownership even across concurrent writes and parent reassignment.
ALTER TABLE public."read-it-later_article"
  ADD CONSTRAINT article_annotation_owner_key UNIQUE (id, "userId");
--> statement-breakpoint
ALTER TABLE public."read-it-later_highlight"
  ADD CONSTRAINT highlight_annotation_owner_key UNIQUE (id, "userId", "articleId");
--> statement-breakpoint
CREATE FUNCTION public.ril_check_highlight_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."userId" IS NOT DISTINCT FROM OLD."userId"
       AND NEW."articleId" IS NOT DISTINCT FROM OLD."articleId" THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM 1 FROM public."read-it-later_article"
    WHERE id = NEW."articleId" AND "userId" = NEW."userId"
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Highlight article must belong to its owner'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.ril_check_note_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."userId" IS NOT DISTINCT FROM OLD."userId"
       AND NEW."articleId" IS NOT DISTINCT FROM OLD."articleId"
       AND NEW."highlightId" IS NOT DISTINCT FROM OLD."highlightId" THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM 1 FROM public."read-it-later_article"
    WHERE id = NEW."articleId" AND "userId" = NEW."userId"
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note article must belong to its owner'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."highlightId" IS NOT NULL THEN
    PERFORM 1 FROM public."read-it-later_highlight"
      WHERE id = NEW."highlightId" AND "userId" = NEW."userId"
        AND "articleId" = NEW."articleId"
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Note highlight must belong to its owner and article'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ril_highlight_ownership_before_write
BEFORE INSERT OR UPDATE OF "userId", "articleId"
ON public."read-it-later_highlight"
FOR EACH ROW EXECUTE FUNCTION public.ril_check_highlight_ownership();
--> statement-breakpoint
CREATE TRIGGER ril_note_ownership_before_write
BEFORE INSERT OR UPDATE OF "userId", "articleId", "highlightId"
ON public."read-it-later_note"
FOR EACH ROW EXECUTE FUNCTION public.ril_check_note_ownership();
--> statement-breakpoint
-- NOT VALID deliberately skips existing child rows. Foreign keys still protect
-- every new/changed relationship, including races and parent-key updates that
-- a BEFORE child trigger alone cannot safely enforce at every isolation level.
ALTER TABLE public."read-it-later_highlight"
  ADD CONSTRAINT highlight_article_owner_fk
  FOREIGN KEY ("articleId", "userId")
  REFERENCES public."read-it-later_article" (id, "userId") NOT VALID;
--> statement-breakpoint
ALTER TABLE public."read-it-later_note"
  ADD CONSTRAINT note_article_owner_fk
  FOREIGN KEY ("articleId", "userId")
  REFERENCES public."read-it-later_article" (id, "userId") NOT VALID;
--> statement-breakpoint
ALTER TABLE public."read-it-later_note"
  ADD CONSTRAINT note_highlight_owner_article_fk
  FOREIGN KEY ("highlightId", "userId", "articleId")
  REFERENCES public."read-it-later_highlight" (id, "userId", "articleId") NOT VALID;
