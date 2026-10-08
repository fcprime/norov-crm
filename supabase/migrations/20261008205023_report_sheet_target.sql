-- Existing settings keep the current Meta — щодня destination.
-- This table already has service-role-only access and RLS from the original migration.
alter table public.client_report_settings
  add column if not exists sheet_target jsonb;
