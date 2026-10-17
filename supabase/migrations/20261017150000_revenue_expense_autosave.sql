begin;
insert into public.feature_profile_permissions(feature_key,profile_id,is_allowed)
values ('gelir-gider','7998f539-5077-472b-ba65-a1d45533eafa',true),
       ('gelir-gider','9d481c04-49b3-48de-8559-3e11185338bc',true)
on conflict(feature_key,profile_id) do update set is_allowed=true;

create or replace function public.revenue_expense_access()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p join public.feature_profile_permissions f on f.profile_id=p.id
 where p.id=auth.uid() and p.approval='approved' and f.feature_key='gelir-gider' and f.is_allowed);
$$;
create or replace function public.revenue_expense_write_access()
returns boolean language sql stable security definer set search_path=public as $$
 select public.revenue_expense_access() and auth.uid() in ('7998f539-5077-472b-ba65-a1d45533eafa'::uuid,'9d481c04-49b3-48de-8559-3e11185338bc'::uuid);
$$;
revoke all on function public.revenue_expense_write_access() from public;
grant execute on function public.revenue_expense_write_access() to authenticated;
revoke insert,update,delete on public.revenue_expense_entries from authenticated;
drop policy if exists revenue_expense_insert on public.revenue_expense_entries;
drop policy if exists revenue_expense_update on public.revenue_expense_entries;
revoke execute on function public.import_revenue_expense(jsonb) from authenticated;
create unique index if not exists revenue_expense_cell_key on public.revenue_expense_entries(store_name,kind,category,year,month);

create or replace function public.save_revenue_expense_cell(p_store text,p_kind text,p_category text,p_year integer,p_month integer,p_amount numeric,p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current_row public.revenue_expense_entries%rowtype;
begin
 if not public.revenue_expense_write_access() then raise exception 'Veri giriş yetkiniz yok.'; end if;
 if p_store is null or p_category is null or p_store<>trim(p_store) or p_category<>trim(p_category) then raise exception 'Geçersiz satır.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_store,p_kind,p_category,p_year,p_month)::text,0));
 select * into current_row from public.revenue_expense_entries where store_name=p_store and kind=p_kind and category=p_category and year=p_year and month=p_month for update;
 if current_row.updated_at is distinct from p_expected then raise exception 'REVENUE_CONFLICT'; end if;
 if current_row.id is null then
   insert into public.revenue_expense_entries(store_name,kind,category,year,month,amount,created_by,updated_by)
   values(p_store,p_kind,p_category,p_year,p_month,p_amount,auth.uid(),auth.uid()) returning * into current_row;
 else
   update public.revenue_expense_entries set amount=p_amount,updated_by=auth.uid() where id=current_row.id returning * into current_row;
 end if;
 return jsonb_build_object('id',current_row.id,'updated_at',current_row.updated_at,'amount',current_row.amount);
end;
$$;
revoke all on function public.save_revenue_expense_cell(text,text,text,integer,integer,numeric,timestamptz) from public;
grant execute on function public.save_revenue_expense_cell(text,text,text,integer,integer,numeric,timestamptz) to authenticated;
commit;
