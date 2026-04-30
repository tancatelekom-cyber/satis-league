create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role' and n.nspname = 'public'
  ) then
    create type public.user_role as enum ('employee', 'manager', 'management', 'admin');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'approval_status' and n.nspname = 'public'
  ) then
    create type public.approval_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'campaign_mode' and n.nspname = 'public'
  ) then
    create type public.campaign_mode as enum ('employee', 'store');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'scoring_type' and n.nspname = 'public'
  ) then
    create type public.scoring_type as enum ('points', 'quantity');
  end if;
end
$$;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  base_multiplier numeric(6,2) not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists stores_name_key on public.stores (name);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role public.user_role not null default 'employee',
  store_id uuid references public.stores(id) on delete set null,
  approval public.approval_status not null default 'pending',
  is_on_leave boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_periods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  mode public.campaign_mode not null default 'employee',
  scoring public.scoring_type not null default 'points',
  season_products text[] not null default '{}',
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.seasons
  add column if not exists reward_title text,
  add column if not exists reward_details text,
  add column if not exists reward_first text,
  add column if not exists reward_second text,
  add column if not exists reward_third text;

create table if not exists public.season_products (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  unit_label text not null default 'adet',
  base_points numeric(10,2) not null default 1,
  sort_order integer not null default 0
);

create table if not exists public.season_store_multipliers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  multiplier numeric(6,2) not null default 1,
  unique (season_id, store_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  mode public.campaign_mode not null,
  scoring public.scoring_type not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.campaigns
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists reward_title text,
  add column if not exists reward_details text,
  add column if not exists reward_first text,
  add column if not exists reward_second text,
  add column if not exists reward_third text;

update public.campaigns
set
  start_at = coalesce(start_at, (start_date::text || ' 00:00:00+03')::timestamptz),
  end_at = coalesce(end_at, (end_date::text || ' 23:59:00+03')::timestamptz)
where start_at is null or end_at is null;

create table if not exists public.campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  sku text,
  unit_label text not null default 'adet',
  base_points numeric(10,2) not null default 1,
  sort_order integer not null default 0
);

create table if not exists public.campaign_store_multipliers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  multiplier numeric(6,2) not null default 1,
  unique (campaign_id, store_id)
);

create table if not exists public.campaign_profile_multipliers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  multiplier numeric(6,2) not null default 1,
  unique (campaign_id, profile_id)
);

create table if not exists public.sales_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.campaign_products(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_store_id uuid references public.stores(id) on delete set null,
  quantity integer not null default 0,
  raw_score numeric(10,2) not null default 0,
  weighted_score numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.season_sales_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  product_id uuid references public.season_products(id) on delete set null,
  product_name text not null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_store_id uuid references public.stores(id) on delete set null,
  quantity integer not null default 1,
  raw_score numeric(10,2) not null default 0,
  score numeric(10,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  level text not null default 'info',
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.stores (name, city, base_multiplier)
values
  ('Bakirkoy AVM', 'Istanbul', 1.00),
  ('Marmara Forum', 'Istanbul', 1.10),
  ('Kadikoy Cadde', 'Istanbul', 0.95),
  ('Ankara Merkez', 'Ankara', 1.15)
on conflict (name) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    phone,
    role,
    store_id,
    approval
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Yeni Kullanici'),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'employee'),
    nullif(new.raw_user_meta_data ->> 'store_id', '')::uuid,
    'pending'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace view public.campaign_employee_leaderboard as
select
  c.id as campaign_id,
  p.id as profile_id,
  p.full_name,
  coalesce(sum(se.weighted_score), 0) as total_score,
  coalesce(sum(se.quantity), 0) as total_quantity
from public.campaigns c
join public.profiles p on p.approval = 'approved' and p.role in ('employee', 'manager')
left join public.sales_entries se
  on se.campaign_id = c.id
 and se.target_profile_id = p.id
where c.mode = 'employee'
  and p.is_on_leave = false
group by c.id, p.id, p.full_name;

create or replace view public.campaign_store_leaderboard as
select
  c.id as campaign_id,
  s.id as store_id,
  s.name as store_name,
  coalesce(sum(se.weighted_score), 0) as total_score,
  coalesce(sum(se.quantity), 0) as total_quantity
from public.campaigns c
join public.stores s on s.is_active = true
left join public.sales_entries se
  on se.campaign_id = c.id
 and se.target_store_id = s.id
where c.mode = 'store'
group by c.id, s.id, s.name;

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.leave_periods enable row level security;
alter table public.seasons enable row level security;
alter table public.season_products enable row level security;
alter table public.season_store_multipliers enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_products enable row level security;
alter table public.campaign_store_multipliers enable row level security;
alter table public.campaign_profile_multipliers enable row level security;
alter table public.sales_entries enable row level security;
alter table public.season_sales_entries enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "active stores are visible to everyone" on public.stores;
create policy "active stores are visible to everyone" on public.stores
for select using (is_active = true);

drop policy if exists "profiles can view themselves" on public.profiles;
create policy "profiles can view themselves" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles can update their own leave flag" on public.profiles;
create policy "profiles can update their own leave flag" on public.profiles
for update using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "approved users can view campaigns" on public.campaigns;
create policy "approved users can view campaigns" on public.campaigns
for select using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval = 'approved'
  )
);

drop policy if exists "approved users can view seasons" on public.seasons;
create policy "approved users can view seasons" on public.seasons
for select using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval = 'approved'
  )
);

drop policy if exists "users can view their notifications" on public.notifications;
create policy "users can view their notifications" on public.notifications
for select using (auth.uid() = profile_id);

drop policy if exists "users can update their notifications" on public.notifications;
create policy "users can update their notifications" on public.notifications
for update using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);
