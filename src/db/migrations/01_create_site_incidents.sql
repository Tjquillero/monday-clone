-- SAFE MIGRATION: Site Incidents (Novedades de Obra)
-- This script is idempotent (can be run multiple times without error)

-- 1. Create table if not exists
create table if not exists site_incidents (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  board_id text not null,
  group_id text not null,
  user_id uuid references auth.users not null,
  type text not null default 'General',
  severity text not null default 'Low',
  description text not null,
  photos text[] default array[]::text[],
  status text default 'Open'
);

-- 2. Enable RLS
alter table site_incidents enable row level security;

-- 3. Create policies safely (Drop first to ensure update)
drop policy if exists "Enable read access for all authenticated users" on site_incidents;
create policy "Enable read access for all authenticated users" on site_incidents
  for select using (auth.role() = 'authenticated');

drop policy if exists "Enable insert access for all authenticated users" on site_incidents;
create policy "Enable insert access for all authenticated users" on site_incidents
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Enable update for users based on user_id" on site_incidents;
create policy "Enable update for users based on user_id" on site_incidents
  for update using (auth.uid() = user_id);

-- 4. Storage Bucket (Safe insert)
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', true)
on conflict (id) do nothing;

-- 5. Storage Policies (Safe recreation)
drop policy if exists "Public Access to Evidence" on storage.objects;
create policy "Public Access to Evidence"
  on storage.objects for select
  using ( bucket_id = 'evidence' );

drop policy if exists "Authenticated Users can upload Evidence" on storage.objects;
create policy "Authenticated Users can upload Evidence"
  on storage.objects for insert
  with check ( bucket_id = 'evidence' and auth.role() = 'authenticated' );

-- 6. Add to Realtime Publication (Safe check)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'site_incidents'
  ) then
    alter publication supabase_realtime add table site_incidents;
  end if;
end;
$$;
