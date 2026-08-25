CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  current_club text NOT NULL DEFAULT '',
  parent_club text,
  on_loan boolean NOT NULL DEFAULT false,
  league text NOT NULL DEFAULT '',
  nationality text NOT NULL DEFAULT '',
  instagram_url text,
  contract_until text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX players_full_name_lower_idx ON public.players (lower(full_name));

GRANT SELECT ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read players"
  ON public.players FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage players"
  ON public.players FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.players (full_name, current_club, parent_club, on_loan, league, nationality, instagram_url, contract_until) VALUES
('Brandon Austin', 'Tottenham Hotspur', 'Tottenham Hotspur', false, 'Premier League', 'England', NULL, 'June 2027'),
('James Beadle', 'Birmingham', 'Brighton & Hove Albion', true, 'EFL Championship', 'England', NULL, 'June 2028'),
('Toby Bell', 'Chelsea', 'Chelsea', false, 'Premier League', 'England', NULL, 'June 2027'),
('Dan Bentley', 'Wolves', 'Wolves', false, 'Premier League', 'England', NULL, 'June 2026'),
('Marcus Bettinelli', 'Manchester City', 'Manchester City', false, 'Premier League', 'England', 'https://www.instagram.com/marcusbettinelli/', 'June 2026'),
('Alex Cairns', 'Leeds United', 'Leeds United', false, 'Premier League', 'England', NULL, 'June 2026'),
('Owen Grainger', 'Nottingham Forest', 'Nottingham Forest', false, 'Premier League', 'Northern Ireland', NULL, 'June 2026'),
('Xander Grieves', 'Southampton', 'Southampton', false, 'EFL Championship', 'Republic of Ireland', NULL, 'June 2027'),
('Steven Hall', 'Brighton & Hove Albion', 'Brighton & Hove Albion', false, 'Premier League', 'Australia', NULL, 'June 2027'),
('Blake Irow', 'Tottenham Hotspur', 'Tottenham Hotspur', false, 'Premier League', 'England', NULL, 'June 2027'),
('Sebastian Jensen', 'Brighton & Hove Albion', 'Brighton & Hove Albion', false, 'Premier League', 'Denmark', NULL, 'June 2026'),
('Jack Talbot', 'Arsenal', 'Arsenal', false, 'Premier League', 'England', NULL, 'June 2027'),
('Ryan Allsop', 'Birmingham City', 'Birmingham City', false, 'EFL Championship', 'England', NULL, 'June 2028'),
('Asmir Begovic', 'Leicester City', 'Leicester City', false, 'EFL Championship', 'Bosnia-Herzegovina', NULL, 'June 2026'),
('Luke Bell', 'Coventry City', 'Coventry City', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Josh Bentley', 'Ipswich Town', 'Ipswich Town', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Louis Brady', 'West Bromwich Albion', 'West Bromwich Albion', false, 'EFL Championship', 'Ireland', NULL, 'June 2026'),
('Joe Bursik', 'Portsmouth', 'Portsmouth', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Callum Burton', 'Wrexham', 'Wrexham', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('David Button', 'Ipswich Town', 'Ipswich Town', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Murphy Cooper', 'Plymouth', 'Plymouth', false, 'EFL League One', 'England', NULL, 'June 2029'),
('David Cornell', 'Preston North End', 'Preston North End', false, 'EFL Championship', 'Wales', NULL, 'June 2026'),
('Cooper Covington', 'Bristol City', 'Bristol City', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Max Crocombe', 'Millwall', 'Millwall', false, 'EFL Championship', 'New Zealand', NULL, 'June 2027'),
('Jamie Cumming', 'Oxford United', 'Oxford United', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Adam Davies', 'Sheffield United', 'Sheffield United', false, 'EFL Championship', 'Wales', NULL, 'June 2026'),
('Seny Dieng', 'Middlesbrough', 'Middlesbrough', false, 'EFL Championship', 'Senegal', NULL, 'June 2027'),
('Jake Donohue', 'Leicester City', 'Leicester City', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Reuben Egan', 'Wrexham', 'Wrexham', false, 'EFL Championship', 'Ireland', NULL, 'June 2026'),
('Simon Eastwood', 'Oxford United', 'Oxford United', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Frank Fielding', 'Stoke City', 'Stoke City', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Andrew Fisher', 'Swansea City', 'Swansea City', false, 'EFL Championship', 'England', NULL, 'June 2028'),
('Felix Goddard', 'Blackburn Rovers', 'Blackburn Rovers', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('True Grant', 'Halifax', 'Stoke City', true, 'National League', 'England', NULL, 'June 2027'),
('Ben Hamer', 'Queens Park Rangers', 'Queens Park Rangers', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Jamie Jones', 'Southampton', 'Southampton', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Ben Killip', 'Portsmouth', 'Portsmouth', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Thimothee Lo-Tutala', 'Hull City', 'Hull City', false, 'EFL Championship', 'France', NULL, 'June 2028'),
('Joe Lumley', 'Sheffield Wednesday', 'Sheffield Wednesday', false, 'EFL League One', 'England', NULL, 'June 2027'),
('Lennon MacLorg', 'Gillingham', 'Gillingham', false, 'EFL League Two', 'England', NULL, 'June 2026'),
('Nicolas Michalski', 'Blackburn Rovers', 'Blackburn Rovers', false, 'EFL Championship', 'England', NULL, 'June 2029'),
('Louie Moulden', 'Accrington', 'Norwich City', true, 'EFL League Two', 'England', NULL, 'June 2026'),
('Rich O''Donnell', 'Derby County', 'Derby County', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Dillon Phillips', 'Hull City', 'Hull City', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('James Pradic', 'Preston North End', 'Preston North End', false, 'EFL Championship', 'Wales', NULL, 'June 2026'),
('Myles Roberts', 'Watford', 'Watford', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Cieran Slicker', 'Barnsley', 'Ipswich Town', true, 'EFL League One', 'Scotland', NULL, 'June 2026'),
('Tom Streets', 'Sheffield Wednesday', 'Sheffield Wednesday', false, 'EFL Championship', 'England', NULL, 'June 2027'),
('Lewis Thomas', 'Bristol City', 'Bristol City', false, 'EFL Championship', 'Wales', NULL, 'June 2026'),
('Lawrence Vigouroux', 'Swansea City', 'Swansea City', false, 'EFL Championship', 'Chile', NULL, 'June 2028'),
('Joe Walsh', 'Wigan', 'Queens Park Rangers', true, 'EFL League One', 'England', NULL, 'June 2027'),
('Christian Walton', 'Ipswich Town', 'Ipswich Town', false, 'EFL Championship', 'England', NULL, 'June 2028'),
('Joe Wildsmith', 'West Bromwich Albion', 'West Bromwich Albion', false, 'EFL Championship', 'England', NULL, 'June 2026'),
('Woody Williamson', 'Ipswich Town', 'Ipswich Town', false, 'EFL Championship', 'Scotland', NULL, 'June 2026'),
('Jacob Zetterstrom', 'Derby County', 'Derby County', false, 'EFL Championship', 'Sweden', NULL, 'June 2027'),
('Luca Ashby-Hammond', 'Plymouth Argyle', 'Plymouth Argyle', false, 'EFL League One', 'England', NULL, 'June 2026'),
('Jak Alnwick', 'Huddersfield Town', 'Huddersfield Town', false, 'EFL League One', 'England', NULL, 'June 2027'),
('Alex Bass', 'Peterborough United', 'Peterborough United', false, 'EFL League One', 'England', NULL, 'June 2028'),
('Henry Blackledge', 'Luton Town', 'Luton Town', false, 'EFL League One', 'Australia', NULL, 'June 2026'),
('Jack Bonham', 'Bolton Wanderers', 'Bolton Wanderers', false, 'EFL League One', 'Ireland', NULL, 'June 2027'),
('Charlie Booth', 'Luton Town', 'Luton Town', false, 'EFL League One', 'England', NULL, 'June 2026'),
('Nathan Broome', 'Bolton Wanderers', 'Bolton Wanderers', false, 'EFL League One', 'England', NULL, 'June 2028'),
('Conor Hazard', 'Wycombe', 'Wycombe', false, 'EFL League One', 'Northern Ireland', NULL, 'June 2026'),
('Max Metcalfe', 'Stockport County', 'Stockport County', false, 'EFL League One', 'Scotland', NULL, 'June 2026'),
('Stuart Moore', 'Wycombe Wanderers', 'Wycombe Wanderers', false, 'EFL League One', 'England', NULL, 'June 2028'),
('Tom Norcott', 'Derry', 'Reading', true, 'League of Ireland', 'England', NULL, 'June 2026'),
('Joel Pereira', 'Reading', 'Reading', false, 'EFL League One', 'Portugal', NULL, 'June 2028'),
('Frankie Phillips', 'Exeter City', 'Exeter City', false, 'EFL League One', 'England', NULL, 'June 2027'),
('Noah Phillips', 'Leyton Orient', 'Leyton Orient', false, 'EFL League One', 'England', NULL, 'June 2027'),
('Liam Roberts', 'Mansfield Town', 'Mansfield Town', false, 'EFL League One', 'England', NULL, 'June 2027'),
('Matt Rowley', 'Reading', 'Reading', false, 'EFL League One', 'England', NULL, 'June 2026'),
('Jack Stevens', 'Reading', 'Reading', false, 'EFL League One', 'England', NULL, 'June 2027'),
('Nik Tzanev', 'Huddersfield', 'Huddersfield', false, 'EFL League One', 'New Zealand', NULL, 'June 2026'),
('Tom Watson', 'Wigan Athletic', 'Wigan Athletic', false, 'EFL League One', 'England', NULL, 'June 2028'),
('Max Woodford', 'Stevenage', 'Stevenage', false, 'EFL League One', 'England', NULL, 'June 2028'),
('Ellis Craven', 'Salford City', 'Salford City', false, 'EFL League Two', 'England', NULL, 'June 2026'),
('Jake Eastwood', 'Cambridge United', 'Cambridge United', false, 'EFL League Two', 'England', NULL, 'June 2026'),
('Mark Howard', 'Salford City', 'Salford City', false, 'EFL League Two', 'England', NULL, 'June 2026'),
('Sam Long', 'Salford', 'Salford', false, 'EFL League Two', 'Scotland', NULL, 'June 2026'),
('Craig MacGillivray', 'MK Dons', 'MK Dons', false, 'EFL League Two', 'Scotland', NULL, 'June 2027'),
('Thomas Smith', 'Colchester United', 'Colchester United', false, 'EFL League Two', 'England', NULL, 'June 2026')
;