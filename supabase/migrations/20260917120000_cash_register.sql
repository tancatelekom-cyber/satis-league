-- Türkiye saatiyle günlük kasa; geçmiş kayıtlar hiçbir rol tarafından değiştirilemez.
begin;
create table if not exists public.cash_register_categories (
  id uuid primary key default gen_random_uuid(), name text not null unique check (length(name) between 1 and 100),
  kind text not null check (kind in ('income','expense','neutral')), is_active boolean not null default true,
  allow_assignment boolean not null default false, allow_installment boolean not null default false
);
alter table public.cash_register_categories enable row level security;
grant select on public.cash_register_categories to authenticated;
drop policy if exists cash_categories_read on public.cash_register_categories;
create policy cash_categories_read on public.cash_register_categories for select to authenticated using (true);
insert into public.cash_register_categories(name,kind) values
('Kontörlü Hat','income'),('Faturalı','neutral'),('Yedek SIM','income'),('Cihaz','income'),
('Aksesuar, Teknik Servis, Hizmet Bedeli','income'),('Paycell ve Paycell Kart','income'),('Gider','expense')
on conflict (name) do nothing;
update public.cash_register_categories set allow_assignment = true where name in ('Cihaz','Aksesuar, Teknik Servis, Hizmet Bedeli');
update public.cash_register_categories set allow_installment = true where name = 'Aksesuar, Teknik Servis, Hizmet Bedeli';

create table if not exists public.cash_register_days (
  store_id uuid not null references public.stores(id),
  entry_date date not null,
  opening numeric(14,2) not null default 0,
  cash_in numeric(14,2) not null default 0 check (cash_in >= 0),
  card_in numeric(14,2) not null default 0 check (card_in >= 0),
  transfer_in numeric(14,2) not null default 0 check (transfer_in >= 0),
  expenses numeric(14,2) not null default 0 check (expenses >= 0),
  bank_deposit numeric(14,2) not null default 0 check (bank_deposit >= 0),
  counted numeric(14,2) not null default 0 check (counted >= 0),
  invoice_cash numeric(14,2) not null default 0 check (invoice_cash >= 0),
  web_cash numeric(14,2) not null default 0 check (web_cash >= 0),
  receipt_start text not null default '',
  entries jsonb not null default '[]',
  closing numeric(14,2) generated always as (counted - bank_deposit) stored,
  note text not null default '' check (length(note) <= 2000),
  revision integer not null default 1,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (store_id, entry_date)
);

create or replace function public.cash_register_access(target_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.approval = 'approved'
    and (p.role = 'admin' or exists (
      select 1 from feature_profile_permissions f
      where f.profile_id = p.id and f.feature_key = 'kasa-takip' and f.is_allowed
    ))
    and (p.role in ('admin', 'management') or p.store_id = target_store)
  );
$$;

alter table public.cash_register_days enable row level security;
drop policy if exists cash_register_read on public.cash_register_days;
create policy cash_register_read on public.cash_register_days for select to authenticated
using (public.cash_register_access(store_id));
-- Writes are only possible through the guarded function below.
revoke all on public.cash_register_days from anon, authenticated;
grant select on public.cash_register_days to authenticated;

create or replace function public.save_cash_register_day(
  p_store uuid, p_date date, p_revision integer, p_opening numeric,
  p_cash numeric, p_card numeric, p_transfer numeric, p_expenses numeric,
  p_deposit numeric, p_counted numeric, p_note text,
  p_invoice numeric, p_web numeric, p_receipt text, p_entries jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  existing public.cash_register_days%rowtype;
  prior_closing numeric;
  normalized_entries jsonb;
  entry jsonb;
  category public.cash_register_categories%rowtype;
  staff_name text;
  amount numeric;
begin
  if not public.cash_register_access(p_store) then raise exception 'Kasa erişim yetkiniz yok.'; end if;
  if p_date is distinct from (clock_timestamp() at time zone 'Europe/Istanbul')::date then
    raise exception 'Yalnızca bugünün kaydı değiştirilebilir.';
  end if;
  if exists (select 1 from unnest(array[p_deposit,p_counted,p_opening,p_invoice,p_web]) n where n is null or n < 0 or n > 999999999999.99 or n::text in ('NaN','Infinity','-Infinity')) or p_deposit > p_counted then raise exception 'Geçersiz kasa tutarı.'; end if;
  -- Only kasa operations share this lock; existing store workflows are not locked.
  perform pg_advisory_xact_lock(hashtextextended('cash-register:' || p_store::text, 0));
  perform 1 from public.stores where id = p_store and is_active;
  if not found then raise exception 'Aktif şube bulunamadı.'; end if;
  if p_date is distinct from (clock_timestamp() at time zone 'Europe/Istanbul')::date then raise exception 'Gün değişti. Sayfayı yenileyin.'; end if;
  select * into existing from public.cash_register_days where store_id = p_store and entry_date = p_date;
  if coalesce(existing.revision, 0) is distinct from p_revision then
    raise exception 'Kayıt başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyin.';
  end if;
  select closing into prior_closing from public.cash_register_days
    where store_id = p_store and entry_date < p_date order by entry_date desc limit 1;
  if prior_closing is null and existing.store_id is null and not exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ) then raise exception 'İlk açılış bakiyesini admin tanımlamalı.'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 500 then raise exception 'En fazla 500 satır girilebilir.'; end if;
  p_cash := 0; p_card := 0; p_expenses := 0; normalized_entries := '[]'::jsonb;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or length(entry->>'receipt') > 100 or length(entry->>'description') > 250 then raise exception 'Geçersiz işlem satırı.'; end if;
    select * into category from public.cash_register_categories where id = (entry->>'category_id')::uuid;
    if not found then raise exception 'Kategori bulunamadı.'; end if;
    if not category.is_active and not exists (select 1 from jsonb_array_elements(coalesce(existing.entries,'[]')) e where e->>'category_id' = category.id::text) then
      raise exception 'Bu kategori kaldırılmış.';
    end if;
    select full_name into staff_name from public.profiles where id = (entry->>'staff')::uuid and store_id = p_store and approval = 'approved';
    if not found then raise exception 'Personel bu şubeye ait değil veya onaylı değil.'; end if;
    amount := (entry->>'amount')::numeric;
    if amount is null or amount < 0 or amount > 999999999999.99 or amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Geçersiz işlem tutarı.'; end if;
    amount := round(amount, 2);
    if entry->>'payment' is null or entry->>'payment' not in ('cash','card','assignment','installment','free') then raise exception 'Geçersiz tahsilat türü.'; end if;
    if entry->>'payment' = 'assignment' and not category.allow_assignment then raise exception 'Bu kategoride temlikli satış kapalı.'; end if;
    if entry->>'payment' = 'installment' and not category.allow_installment then raise exception 'Bu kategoride sepete taksit kapalı.'; end if;
    entry := entry || jsonb_build_object('amount',amount,'cash',case when entry->>'payment' = 'cash' then amount else 0 end, 'card',case when entry->>'payment' = 'card' then amount else 0 end, 'staff_name',staff_name);
    if (entry->>'cash')::numeric < 0 or (entry->>'card')::numeric < 0
      or entry->>'cash' is null or entry->>'card' is null
      or (entry->>'cash') in ('NaN','Infinity','-Infinity') or (entry->>'card') in ('NaN','Infinity','-Infinity') then raise exception 'Geçersiz tutar.'; end if;
    if category.kind = 'income' then p_cash := p_cash + (entry->>'cash')::numeric; p_card := p_card + (entry->>'card')::numeric; end if;
    if category.kind = 'expense' then p_expenses := p_expenses + (entry->>'cash')::numeric; end if;
    normalized_entries := normalized_entries || jsonb_build_array(entry || jsonb_build_object('category_name',category.name,'kind',category.kind));
  end loop;
  insert into public.cash_register_days (
    store_id, entry_date, opening, cash_in, card_in, transfer_in, expenses, bank_deposit, counted, note, updated_by, invoice_cash, web_cash, receipt_start, entries
  ) values (
    p_store, p_date, coalesce(prior_closing, existing.opening, p_opening),
    p_cash, p_card, p_transfer, p_expenses, p_deposit, p_counted, p_note, auth.uid(), p_invoice, p_web, p_receipt, normalized_entries
  ) on conflict (store_id, entry_date) do update set
    cash_in = excluded.cash_in, card_in = excluded.card_in, transfer_in = excluded.transfer_in,
    expenses = excluded.expenses, bank_deposit = excluded.bank_deposit,
    counted = excluded.counted, note = excluded.note, updated_by = auth.uid(),
    invoice_cash = excluded.invoice_cash, web_cash = excluded.web_cash, receipt_start = excluded.receipt_start, entries = excluded.entries,
    updated_at = clock_timestamp(), revision = cash_register_days.revision + 1;
end;
$$;
revoke all on function public.save_cash_register_day(uuid,date,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,jsonb) from public;
grant execute on function public.save_cash_register_day(uuid,date,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,jsonb) to authenticated;

insert into public.feature_menu_permissions(feature_key,label,employee_visible,manager_visible,management_visible,admin_visible)
values ('kasa-takip','Kasa Takip',false,false,false,true) on conflict (feature_key) do nothing;
commit;
