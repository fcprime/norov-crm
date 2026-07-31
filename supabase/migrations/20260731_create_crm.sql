-- Norov CRM database schema
create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_id text,
  name text not null,
  phone text not null,
  whatsapp text,
  service text not null default 'Meta Ads',
  source text not null default 'Facebook Lead Ads',
  campaign text not null default '',
  status text not null default 'new' check (status in ('new','call','message','strategy','presented','decision','later','launchPrep','paid','active','completed','lost')),
  value numeric(12,2) not null default 0,
  next_action text,
  note text,
  form_answers text,
  lost_reason text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_owner_external_id_unique
  on public.leads(owner_id, external_id);
create index if not exists leads_owner_status_idx on public.leads(owner_id, status);
create index if not exists leads_owner_created_idx on public.leads(owner_id, created_at desc);

create table if not exists public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events(lead_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();

alter table public.leads enable row level security;
alter table public.lead_events enable row level security;

grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.lead_events to authenticated;
grant usage, select on sequence public.lead_events_id_seq to authenticated;

create policy "Users read own leads" on public.leads
for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users insert own leads" on public.leads
for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users update own leads" on public.leads
for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Users delete own leads" on public.leads
for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "Users read own lead events" on public.lead_events
for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users insert own lead events" on public.lead_events
for insert to authenticated with check ((select auth.uid()) = owner_id);
