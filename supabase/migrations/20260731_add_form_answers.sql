-- Norov CRM v7: separate lead-form answers from manual notes
alter table public.leads
  add column if not exists form_answers text;
