create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  service text not null default '',
  status text not null default 'active' check (status in ('active','paused','archived')),
  start_date date not null default current_date,
  billing_type text not null default 'days' check (billing_type in ('days','monthly','custom')),
  interval_days integer not null default 15,
  amount numeric(12,2) not null default 0,
  currency text not null default 'PLN' check (currency in ('PLN','EUR','USD','GBP')),
  next_payment_date date not null default current_date,
  source text,
  contact text,
  notes text,
  archived_at date,
  archive_reason text,
  source_lead_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  due_date date not null,
  paid_at date not null default current_date,
  amount numeric(12,2) not null default 0,
  currency text not null default 'PLN' check (currency in ('PLN','EUR','USD','GBP')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists clients_owner_status_idx on public.clients(owner_id,status);
create index if not exists clients_owner_next_payment_idx on public.clients(owner_id,next_payment_date);
create unique index if not exists clients_owner_source_lead_uidx on public.clients(owner_id,source_lead_id) where source_lead_id is not null;
create index if not exists payments_owner_paid_at_idx on public.payments(owner_id,paid_at desc);
create index if not exists payments_client_idx on public.payments(client_id,paid_at desc);

alter table public.clients enable row level security;
alter table public.payments enable row level security;

drop policy if exists "clients_owner_all" on public.clients;
create policy "clients_owner_all" on public.clients for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "payments_owner_all" on public.payments;
create policy "payments_owner_all" on public.payments for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

do $$ begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null; end $$;
