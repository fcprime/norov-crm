alter table public.client_report_settings
  add column if not exists daily_time time not null default '08:10',
  add column if not exists weekly_time time not null default '09:00';
