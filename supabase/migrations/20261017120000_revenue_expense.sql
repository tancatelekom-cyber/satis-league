begin;
create or replace function public.revenue_expense_access()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.approval = 'approved'
    and p.role in ('admin', 'management')
    and coalesce(
      (select fp.is_allowed from public.feature_profile_permissions fp where fp.profile_id = p.id and fp.feature_key = 'gelir-gider'),
      (select case when p.role = 'admin' then fm.admin_visible else fm.management_visible end from public.feature_menu_permissions fm where fm.feature_key = 'gelir-gider'),
      true)
  );
$$;
revoke all on function public.revenue_expense_access() from public;
grant execute on function public.revenue_expense_access() to authenticated;

create table public.revenue_expense_entries (
  id uuid primary key default gen_random_uuid(),
  store_name text not null check (length(trim(store_name)) between 1 and 150),
  kind text not null check (kind in ('gelir', 'gider')),
  category text not null check (length(trim(category)) between 1 and 150),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  amount numeric not null check (amount between -999999999999.99 and 999999999999.99),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index revenue_expense_period on public.revenue_expense_entries(year, month);
alter table public.revenue_expense_entries enable row level security;
revoke all on public.revenue_expense_entries from anon, authenticated;
grant select, insert, update on public.revenue_expense_entries to authenticated;
create policy revenue_expense_read on public.revenue_expense_entries for select to authenticated using (public.revenue_expense_access());
create policy revenue_expense_insert on public.revenue_expense_entries for insert to authenticated with check (public.revenue_expense_access() and created_by = auth.uid() and updated_by = auth.uid());
create policy revenue_expense_update on public.revenue_expense_entries for update to authenticated using (public.revenue_expense_access()) with check (public.revenue_expense_access() and updated_by = auth.uid());
create function public.revenue_expense_stamp() returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := old.created_by; new.created_at := old.created_at;
  new.updated_at := clock_timestamp(); new.updated_by := auth.uid(); return new;
end;
$$;
create trigger revenue_expense_stamp before update on public.revenue_expense_entries for each row execute function public.revenue_expense_stamp();

create table public.revenue_expense_imports (source text primary key, imported_at timestamptz not null default now(), row_count integer not null);
alter table public.revenue_expense_imports enable row level security;
revoke all on public.revenue_expense_imports from anon, authenticated;
create function public.import_revenue_expense(entries jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.revenue_expense_access() then raise exception 'Erişim yetkiniz yok.'; end if;
  if entries is null or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 then raise exception 'Boş aktarım.'; end if;
  insert into public.revenue_expense_imports(source, row_count) values ('google-sheets-452261502', jsonb_array_length(entries));
  insert into public.revenue_expense_entries(store_name,kind,category,year,month,amount,created_by,updated_by)
    select e.store_name,e.kind,e.category,e.year,e.month,e.amount,auth.uid(),auth.uid()
    from jsonb_to_recordset(entries) as e(store_name text,kind text,category text,year integer,month integer,amount numeric);
end;
$$;
revoke all on function public.import_revenue_expense(jsonb) from public;
grant execute on function public.import_revenue_expense(jsonb) to authenticated;
commit;
