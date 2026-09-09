alter table public.clients
  add column if not exists reminder_days_before integer not null default 3;

update public.clients
set reminder_days_before = 3
where reminder_days_before is null;
