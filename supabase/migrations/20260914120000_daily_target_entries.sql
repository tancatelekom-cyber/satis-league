create table if not exists public.daily_target_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  main_category text not null,
  sub_category text not null,
  actual numeric(14,2) not null default 0 check (actual >= 0),
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_date, store_id, main_category, sub_category)
);

create index if not exists daily_target_entries_date_store_idx
  on public.daily_target_entries (entry_date, store_id);

alter table public.daily_target_entries enable row level security;

drop policy if exists "daily target rows are visible to authorized roles" on public.daily_target_entries;
create policy "daily target rows are visible to authorized roles"
on public.daily_target_entries for select using (
  exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and actor.approval = 'approved'
      and (
        actor.role in ('admin', 'management')
        or (actor.role = 'manager' and actor.store_id = daily_target_entries.store_id)
      )
  )
);

drop policy if exists "managers and admins can insert daily targets" on public.daily_target_entries;
create policy "managers and admins can insert daily targets"
on public.daily_target_entries for insert with check (
  entry_date = (current_timestamp at time zone 'Europe/Istanbul')::date
  and entered_by = auth.uid()
  and exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and actor.approval = 'approved'
      and (
        actor.role = 'admin'
        or (actor.role = 'manager' and actor.store_id = daily_target_entries.store_id)
      )
  )
);

drop policy if exists "managers and admins can update daily targets" on public.daily_target_entries;
create policy "managers and admins can update daily targets"
on public.daily_target_entries for update using (
  exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and actor.approval = 'approved'
      and (
        actor.role = 'admin'
        or (actor.role = 'manager' and actor.store_id = daily_target_entries.store_id)
      )
  )
) with check (
  entry_date = (current_timestamp at time zone 'Europe/Istanbul')::date
  and entered_by = auth.uid()
  and exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and actor.approval = 'approved'
      and (
        actor.role = 'admin'
        or (actor.role = 'manager' and actor.store_id = daily_target_entries.store_id)
      )
  )
);
