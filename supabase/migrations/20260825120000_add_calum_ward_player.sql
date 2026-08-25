-- Ensure Calum Ward exists as a canonical RPM goalkeeper record.
-- He joined Queens Park Rangers from Motherwell on 9 July 2026 and is now
-- an RPM client. Transfermarkt: spieler/655135. Official spelling is Calum
-- (not Callum). Contract length not published at insert time.
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
  'Calum Ward',
  'Queens Park Rangers',
  'Queens Park Rangers',
  false,
  'EFL Championship',
  'England',
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.players WHERE lower(full_name) = lower('Calum Ward')
);

UPDATE public.players
SET
  current_club = 'Queens Park Rangers',
  parent_club = 'Queens Park Rangers',
  on_loan = false,
  league = 'EFL Championship',
  nationality = 'England',
  updated_at = now()
WHERE lower(full_name) = lower('Calum Ward')
  AND (
    current_club IS DISTINCT FROM 'Queens Park Rangers'
    OR parent_club IS DISTINCT FROM 'Queens Park Rangers'
    OR on_loan IS DISTINCT FROM false
    OR league IS DISTINCT FROM 'EFL Championship'
    OR nationality IS DISTINCT FROM 'England'
  );
