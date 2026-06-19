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
  category_name text not null default 'Genel',
  unit_label text not null default 'adet',
  base_points numeric(10,2) not null default 1,
  sort_order integer not null default 0
);

alter table public.season_products
  add column if not exists category_name text not null default 'Genel';

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
  add column if not exists reward_threshold_value numeric(10,2),
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

create table if not exists public.campaign_entry_permissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
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
  entry_date date not null default current_date,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_store_id uuid references public.stores(id) on delete set null,
  quantity integer not null default 1,
  raw_score numeric(10,2) not null default 0,
  score numeric(10,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table public.season_sales_entries
  add column if not exists entry_date date not null default current_date;

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

create table if not exists public.popup_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_path text,
  target_roles text[] not null default '{}'::text[],
  show_from timestamptz not null,
  show_until timestamptz not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.popup_announcements
  add column if not exists image_path text;

create table if not exists public.popup_announcement_dismissals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.popup_announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  unique (announcement_id, profile_id)
);

create table if not exists public.tariffs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'Turkcell',
  source_url text,
  name text not null,
  category_name text not null default 'Genel',
  line_type text not null default 'faturali',
  data_gb numeric(10,2) not null default 0,
  minutes integer not null default 0,
  sms integer not null default 0,
  price numeric(10,2) not null default 0,
  details text,
  is_online_only boolean not null default false,
  is_digital_only boolean not null default false,
  is_active boolean not null default true,
  scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_campaign_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Aylik Kampanya',
  image_path text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_work_schedules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  week_start date not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  status text not null default 'off' check (status in ('work', 'training', 'sick', 'leave', 'off')),
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_work_schedules_profile_week_day_key unique (profile_id, week_start, day_of_week),
  constraint weekly_work_schedules_time_check check (
    (
      status = 'work'
      and start_time is not null
      and end_time is not null
      and start_time < end_time
    )
    or (
      status in ('training', 'sick', 'leave', 'off')
      and start_time is null
      and end_time is null
    )
  )
);

create index if not exists weekly_work_schedules_week_start_idx
  on public.weekly_work_schedules (week_start);

create index if not exists weekly_work_schedules_store_week_idx
  on public.weekly_work_schedules (store_id, week_start);

create index if not exists weekly_work_schedules_profile_week_idx
  on public.weekly_work_schedules (profile_id, week_start);

create table if not exists public.manager_presentation_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manager_presentation_sections
  add column if not exists is_visible boolean not null default true;

create table if not exists public.manager_presentation_store_tables (
  id uuid primary key default gen_random_uuid(),
  table_key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_menu_permissions (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  label text not null,
  employee_visible boolean not null default false,
  manager_visible boolean not null default true,
  management_visible boolean not null default true,
  admin_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.manager_presentation_sections (section_key, label, sort_order, is_visible)
values
  ('cover', 'Kapak ve Ozet', 0, true),
  ('overview', 'Genel Gorunum', 1, true),
  ('company', 'Firma Genel Durumu', 2, true),
  ('storeFocus', 'Magaza Kritikleri', 3, true),
  ('storeTables', 'Magaza Tablolari', 4, true),
  ('employeeFocus', 'Calisan Kritikleri', 5, true),
  ('employeeTables', 'Calisan Tablolari', 6, true),
  ('actions', 'Aksiyon Plani', 7, true),
  ('closing', 'Kapanis Mesaji', 8, true)
on conflict (section_key) do nothing;

insert into public.feature_menu_permissions (
  feature_key,
  label,
  employee_visible,
  manager_visible,
  management_visible,
  admin_visible
)
values
  ('web-kontor', 'Web Kontor Menusu', false, true, true, true)
on conflict (feature_key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'monthly-campaigns',
  'monthly-campaigns',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'popup-announcements',
  'popup-announcements',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
alter table public.campaign_entry_permissions enable row level security;
alter table public.sales_entries enable row level security;
alter table public.season_sales_entries enable row level security;
alter table public.notifications enable row level security;
alter table public.popup_announcements enable row level security;
alter table public.popup_announcement_dismissals enable row level security;
alter table public.weekly_work_schedules enable row level security;
alter table public.feature_menu_permissions enable row level security;

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

drop policy if exists "approved users can view popup announcements" on public.popup_announcements;
create policy "approved users can view popup announcements" on public.popup_announcements
for select using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval = 'approved'
  )
);

drop policy if exists "users can view popup dismissals" on public.popup_announcement_dismissals;
create policy "users can view popup dismissals" on public.popup_announcement_dismissals
for select using (auth.uid() = profile_id);

drop policy if exists "users can create popup dismissals" on public.popup_announcement_dismissals;
create policy "users can create popup dismissals" on public.popup_announcement_dismissals
for insert with check (auth.uid() = profile_id);

drop policy if exists "approved users can view weekly work schedules" on public.weekly_work_schedules;
create policy "approved users can view weekly work schedules" on public.weekly_work_schedules
for select using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval = 'approved'
  )
);

drop policy if exists "users can manage their own weekly work schedules" on public.weekly_work_schedules;
create policy "users can manage their own weekly work schedules" on public.weekly_work_schedules
for all using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

drop policy if exists "approved users can view feature menu permissions" on public.feature_menu_permissions;
create policy "approved users can view feature menu permissions" on public.feature_menu_permissions
for select using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval = 'approved'
  )
);
