-- MPS #60: app version control table
-- Used to force-block outdated native builds and signal critical OTA updates.
create table if not exists app_version_control (
  id                   uuid primary key default gen_random_uuid(),
  platform             text not null check (platform in ('ios', 'android')),
  min_supported_version text not null,   -- e.g. "1.4.0" — block below this
  latest_version        text not null,   -- e.g. "1.6.0" — informational
  force_update          boolean not null default false,
  update_message        text,
  created_at            timestamptz default now(),
  unique (platform)
);

-- Row-level security: public read, service-role write
alter table app_version_control enable row level security;

create policy "public read"
  on app_version_control for select
  using (true);

-- Seed initial rows (both platforms unblocked at v1.0.0)
insert into app_version_control (platform, min_supported_version, latest_version, force_update)
values
  ('ios',     '1.0.0', '1.0.0', false),
  ('android', '1.0.0', '1.0.0', false)
on conflict (platform) do nothing;
