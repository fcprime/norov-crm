alter table public.clients
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists telegram text;

-- Backfill the legacy contact into WhatsApp only when WhatsApp is empty.
-- This keeps existing clients reachable after the migration.
update public.clients
set whatsapp = contact
where (whatsapp is null or whatsapp = '')
  and contact is not null
  and contact <> '';
