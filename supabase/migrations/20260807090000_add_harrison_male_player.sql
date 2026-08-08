-- Ensure Harrison Male exists as a canonical player record so mentor managers
-- can correct his club from the Goalkeepers profile (players.edit_club).
-- Also keep club/league current when the row already exists.
INSERT INTO public.players (
  full_name,
  current_club,
  parent_club,
  on_loan,
  league,
  nationality,
  instagram_url,
  contract_until
)
SELECT
  'Harrison Male',
  'Tranmere Rovers',
  'Tranmere Rovers',
  false,
  'EFL League Two',
  'England',
  NULL,
  'June 2026'
WHERE NOT EXISTS (
  SELECT 1 FROM public.players WHERE lower(full_name) = lower('Harrison Male')
);

UPDATE public.players
SET
  current_club = 'Tranmere Rovers',
  parent_club = COALESCE(NULLIF(parent_club, ''), 'Tranmere Rovers'),
  league = 'EFL League Two',
  updated_at = now()
WHERE lower(full_name) = lower('Harrison Male')
  AND (
    current_club IS DISTINCT FROM 'Tranmere Rovers'
    OR league IS DISTINCT FROM 'EFL League Two'
  );
