begin;
alter table public.cash_register_categories add column if not exists sort_order integer;
with ranked as (
  select id, row_number() over(order by sort_order nulls last,name,id)::integer as position
  from public.cash_register_categories
)
update public.cash_register_categories c set sort_order=r.position from ranked r where c.id=r.id and c.sort_order is null;
alter table public.cash_register_categories alter column sort_order set default 2147483647;
alter table public.cash_register_categories alter column sort_order set not null;

-- Called only by the admin server action after requireAdminAccess().
create or replace function public.move_cash_category(category_id uuid, direction integer)
returns void language plpgsql security definer set search_path=public as $$
declare ids uuid[]; current_position integer; target_position integer; other_id uuid;
begin
  if direction is null or direction not in (-1,1) then raise exception 'Geçersiz yön'; end if;
  perform pg_advisory_xact_lock(20260921,120000);
  select array_agg(id order by sort_order,name,id) into ids from public.cash_register_categories;
  current_position:=array_position(ids,category_id);
  if current_position is null then raise exception 'Kategori bulunamadı'; end if;
  target_position:=current_position+direction;
  if target_position<1 or target_position>array_length(ids,1) then return; end if;
  other_id:=ids[target_position];
  ids[target_position]:=category_id;
  ids[current_position]:=other_id;
  update public.cash_register_categories c set sort_order=ordered.position::integer
    from unnest(ids) with ordinality as ordered(id,position) where c.id=ordered.id;
end;
$$;
revoke all on function public.move_cash_category(uuid,integer) from public,anon,authenticated;
grant execute on function public.move_cash_category(uuid,integer) to service_role;
commit;
