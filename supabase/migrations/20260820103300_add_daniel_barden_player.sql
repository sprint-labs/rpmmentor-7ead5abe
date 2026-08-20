-- Ensure Daniel Barden exists as a canonical RPM goalkeeper record.
-- He joined Stevenage in August 2026 after leaving Norwich City.
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
  'Daniel Barden',
  'Stevenage',
  'Stevenage',
  false,
  'EFL League One',
  'Wales',
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.players WHERE lower(full_name) = lower('Daniel Barden')
);

UPDATE public.players
SET
  current_club = 'Stevenage',
  parent_club = 'Stevenage',
  on_loan = false,
  league = 'EFL League One',
  nationality = 'Wales',
  updated_at = now()
WHERE lower(full_name) = lower('Daniel Barden')
  AND (
    current_club IS DISTINCT FROM 'Stevenage'
    OR parent_club IS DISTINCT FROM 'Stevenage'
    OR on_loan IS DISTINCT FROM false
    OR league IS DISTINCT FROM 'EFL League One'
    OR nationality IS DISTINCT FROM 'Wales'
  );
