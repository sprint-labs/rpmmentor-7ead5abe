alter table public.media_assets
  add column if not exists asset_purpose text not null default 'general',
  add column if not exists match_event_id uuid references public.calendar_events(id) on delete set null,
  add column if not exists upload_batch_id uuid;

alter table public.media_assets
  drop constraint if exists media_assets_asset_purpose_check;
alter table public.media_assets
  add constraint media_assets_asset_purpose_check
  check (asset_purpose in ('general', 'match_clip'));

create index if not exists media_assets_match_clips_idx
  on public.media_assets (created_at desc)
  where asset_purpose = 'match_clip';
create index if not exists media_assets_match_event_id_idx
  on public.media_assets (match_event_id);
create index if not exists media_assets_upload_batch_id_idx
  on public.media_assets (upload_batch_id);

comment on column public.media_assets.asset_purpose is
  'Why the file was uploaded. general = every pre-existing row and every upload outside Match Clips; match_clip = uploaded through the Match Clips workflow only. Never reclassified automatically.';
comment on column public.media_assets.match_event_id is
  'The calendar Match this clip is footage of. Null for general media and for match clips not yet linked to a fixture. Deleting the fixture keeps the clip.';
comment on column public.media_assets.upload_batch_id is
  'Client-generated id shared by every file sent in one Match Clips upload session.';
