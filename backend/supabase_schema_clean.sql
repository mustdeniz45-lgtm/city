create table if not exists public.cities (
  id           text primary key,
  name         text not null,
  country      text,
  country_code text,
  tagline      text,
  description  text,
  hero_image   text,
  lat          double precision,
  lng          double precision,
  poi_count    integer not null default 0,
  quest_count  integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.pois (
  id          text primary key,
  city_id     text not null references public.cities(id) on delete cascade,
  name        text not null,
  name_tr     text,
  category    text,
  description text,
  image       text,
  lat         double precision,
  lng         double precision,
  rating      double precision default 4.5,
  xp_reward   integer default 50,
  kultur_yolu boolean default false,
  ky_seq      integer,
  source      text,
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists pois_city_idx on public.pois (city_id);
create index if not exists pois_city_category_idx on public.pois (city_id, category);
create index if not exists pois_kultur_yolu_idx on public.pois (city_id) where kultur_yolu = true;

create table if not exists public.dishes (
  id          text primary key,
  city_id     text not null references public.cities(id) on delete cascade,
  name        text not null,
  description text,
  image       text,
  tags        jsonb default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists dishes_city_idx on public.dishes (city_id);

create table if not exists public.quests (
  id                 text primary key,
  city_id            text not null references public.cities(id) on delete cascade,
  title              text not null,
  description        text,
  difficulty         text,
  category           text,
  xp_reward          integer not null default 50,
  poi_ids            jsonb not null default '[]'::jsonb,
  cover_image        text,
  estimated_minutes  integer default 60,
  badge_name         text,
  trivia             jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists quests_city_idx on public.quests (city_id);
create index if not exists quests_city_diff_idx on public.quests (city_id, difficulty);

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text default 'Traveler',
  avatar_url   text,
  device_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists profiles_device_idx on public.profiles (device_id);

create table if not exists public.progress (
  id                bigserial primary key,
  user_id           uuid references auth.users(id) on delete set null,
  device_id         text,
  display_name      text default 'Traveler',
  avatar_uri        text,
  xp                integer not null default 0,
  completed_quests  jsonb not null default '[]'::jsonb,
  badges            jsonb not null default '[]'::jsonb,
  check_ins         jsonb not null default '[]'::jsonb,
  quest_progress    jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  unique(user_id),
  unique(device_id)
);
create index if not exists progress_xp_idx on public.progress (xp desc);

alter table public.cities   enable row level security;
alter table public.pois     enable row level security;
alter table public.dishes   enable row level security;
alter table public.quests   enable row level security;
alter table public.profiles enable row level security;
alter table public.progress enable row level security;

drop policy if exists "public_read_cities" on public.cities;
create policy "public_read_cities" on public.cities for select using (true);
drop policy if exists "public_read_pois" on public.pois;
create policy "public_read_pois"   on public.pois   for select using (true);
drop policy if exists "public_read_dishes" on public.dishes;
create policy "public_read_dishes" on public.dishes for select using (true);
drop policy if exists "public_read_quests" on public.quests;
create policy "public_read_quests" on public.quests for select using (true);

drop policy if exists "profiles_own_select" on public.profiles;
create policy "profiles_own_select" on public.profiles for select using (auth.uid() = user_id);
drop policy if exists "profiles_own_upsert" on public.profiles;
create policy "profiles_own_upsert" on public.profiles for insert with check (auth.uid() = user_id);
drop policy if exists "profiles_own_update" on public.profiles;
create policy "profiles_own_update" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "progress_public_select" on public.progress;
create policy "progress_public_select" on public.progress for select using (true);
drop policy if exists "progress_own_insert" on public.progress;
create policy "progress_own_insert" on public.progress for insert with check (auth.uid() = user_id);
drop policy if exists "progress_own_update" on public.progress;
create policy "progress_own_update" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('avatars',   'avatars',   true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('postcards', 'postcards', false)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_auth_upload" on storage.objects;
create policy "avatars_auth_upload" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "postcards_owner_all" on storage.objects;
create policy "postcards_owner_all" on storage.objects
  for all using (bucket_id = 'postcards' and auth.uid()::text = (storage.foldername(name))[1])
        with check (bucket_id = 'postcards' and auth.uid()::text = (storage.foldername(name))[1]);
