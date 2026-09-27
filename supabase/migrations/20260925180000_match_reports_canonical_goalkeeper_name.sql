-- Store Match Report goalkeeper names in the roster's spelling.
--
-- match_reports_cache links a report to a goalkeeper by name only, so a report
-- typed as "james beadle" was counted apart from "James Beadle" in every
-- per-goalkeeper total. Three such rows were corrected by hand on 25 Sep 2026.
--
-- On insert, and whenever goalkeeper changes, this trigger trims the name,
-- collapses repeated spaces and, when exactly one live roster player matches
-- ignoring case and spacing, replaces it with that player's full_name. Names
-- with no roster match (external goalkeepers) keep their own spelling, and an
-- ambiguous match is left untouched. The comparison uses the same
-- normalisation as match_reports_guard_event_snapshot(), so linked reports are
-- still validated against their event. Scores, dates and links are not touched.
CREATE OR REPLACE FUNCTION public.match_reports_canonical_goalkeeper_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  roster_name text;
  roster_matches integer;
BEGIN
  IF NEW.goalkeeper IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.goalkeeper := regexp_replace(btrim(NEW.goalkeeper), '[[:space:]]+', ' ', 'g');

  SELECT min(p.full_name), count(*)
  INTO roster_name, roster_matches
  FROM public.players AS p
  WHERE p.deleted_at IS NULL
    AND lower(regexp_replace(btrim(p.full_name), '[[:space:]]+', ' ', 'g'))
        = lower(NEW.goalkeeper);

  IF roster_matches = 1 THEN
    NEW.goalkeeper := regexp_replace(btrim(roster_name), '[[:space:]]+', ' ', 'g');
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.match_reports_canonical_goalkeeper_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS match_reports_cache_canonical_goalkeeper ON public.match_reports_cache;
CREATE TRIGGER match_reports_cache_canonical_goalkeeper
  BEFORE INSERT OR UPDATE OF goalkeeper ON public.match_reports_cache
  FOR EACH ROW EXECUTE FUNCTION public.match_reports_canonical_goalkeeper_name();
