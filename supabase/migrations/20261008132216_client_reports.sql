-- Settings are server-only. Edge Function authorizes every request against clients.owner_id.
create table public.client_report_settings (
 client_id uuid primary key references public.clients(id) on delete cascade,
 enabled boolean not null default false,
 daily boolean not null default true,
 weekly boolean not null default false,
 ad_account_id text not null default '',
 spreadsheet_id text not null default '',
 chat_id text not null default '',
 bot_cipher text,
 start_date date not null default current_date,
 last_success timestamptz,
 last_error text,
 locked_until timestamptz
);
alter table public.client_report_settings enable row level security;
revoke all on public.client_report_settings from public, anon, authenticated;
grant all on public.client_report_settings to service_role;
-- Delivery receipts contain no report metrics; retained only to prevent duplicate sends.
create table public.client_report_delivery (
 client_id uuid not null references public.clients(id) on delete cascade,
 delivery_key text not null,
 state text not null check (state in ('sending','sent','uncertain')),
 created_at timestamptz not null default now(),
 primary key(client_id,delivery_key)
);
alter table public.client_report_delivery enable row level security;
revoke all on public.client_report_delivery from public, anon, authenticated;
grant all on public.client_report_delivery to service_role;
-- Track resume date on client row with normal invoker rights and existing owner RLS.
alter table public.clients add column reports_active_since date;
create function public.set_reports_resume_date() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.status = 'active' and old.status is distinct from 'active' then
  new.reports_active_since := (now() at time zone 'Europe/Warsaw')::date;
 end if;
 return new;
end $$;
revoke all on function public.set_reports_resume_date() from public, anon, authenticated;
create trigger reports_resume_date before update of status on public.clients
for each row execute function public.set_reports_resume_date();

create table public.report_integrations (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 meta_cipher text,
 google_cipher text
);
alter table public.report_integrations enable row level security;
revoke all on public.report_integrations from public, anon, authenticated;
grant all on public.report_integrations to service_role;
