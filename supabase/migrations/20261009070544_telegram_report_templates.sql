-- Uses the existing owner-only report settings access model. No new grants or policies.
alter table public.client_report_settings
  add column if not exists telegram_templates jsonb;
