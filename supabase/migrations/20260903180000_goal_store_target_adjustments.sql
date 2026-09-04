create table if not exists public.goal_store_target_adjustments (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  store_code text not null,
  category_name text not null,
  increase_percent numeric(8,3) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_month, store_code, category_name),
  check (period_month = date_trunc('month', period_month)::date),
  check (increase_percent >= 0 and increase_percent <= 1000)
);

alter table public.goal_store_target_adjustments enable row level security;

drop policy if exists "approved users can view goal store target adjustments"
  on public.goal_store_target_adjustments;
create policy "approved users can view goal store target adjustments"
on public.goal_store_target_adjustments for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.approval = 'approved'
  )
);
