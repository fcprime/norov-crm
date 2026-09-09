alter table public.clients add column if not exists source_lead_id text;
create unique index if not exists clients_owner_source_lead_uidx on public.clients(owner_id,source_lead_id) where source_lead_id is not null;
