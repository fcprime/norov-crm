create table if not exists public.payment_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  reminder_date date not null,
  reminder_type text not null check (reminder_type in ('advance','tomorrow','today','overdue')),
  due_date date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_reminder_logs_unique_idx
  on public.payment_reminder_logs(client_id, reminder_date, reminder_type);

create index if not exists payment_reminder_logs_owner_date_idx
  on public.payment_reminder_logs(owner_id, reminder_date desc);

alter table public.payment_reminder_logs enable row level security;

drop policy if exists "payment_reminder_logs_owner_read" on public.payment_reminder_logs;
create policy "payment_reminder_logs_owner_read"
on public.payment_reminder_logs
for select
using (auth.uid() = owner_id);
