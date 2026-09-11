alter table public.monthly_campaign_slides
  add column if not exists campaign_type text not null default 'turkcell';

update public.monthly_campaign_slides
set campaign_type = 'turkcell'
where campaign_type is null
   or campaign_type not in ('turkcell', 'tanca');

alter table public.monthly_campaign_slides
  drop constraint if exists monthly_campaign_slides_campaign_type_check;

alter table public.monthly_campaign_slides
  add constraint monthly_campaign_slides_campaign_type_check
  check (campaign_type in ('turkcell', 'tanca'));

create index if not exists monthly_campaign_slides_type_sort_idx
  on public.monthly_campaign_slides (campaign_type, sort_order, created_at desc);
