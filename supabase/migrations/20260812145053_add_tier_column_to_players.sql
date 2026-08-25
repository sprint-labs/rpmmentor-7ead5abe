ALTER TABLE public.players
ADD COLUMN tier text CHECK (tier IN ('Tier 1','Tier 2','Tier 3','Tier 4','Academy','Free Agent'));
