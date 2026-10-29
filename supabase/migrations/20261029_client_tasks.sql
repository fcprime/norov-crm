create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  status text not null default 'planned' check (status in ('planned','in_progress','waiting_client','completed')),
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  due_date date,
  due_time time,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "tasks_owner_select" on public.tasks;
drop policy if exists "tasks_owner_insert" on public.tasks;
drop policy if exists "tasks_owner_update" on public.tasks;
drop policy if exists "tasks_owner_delete" on public.tasks;

create policy "tasks_owner_select" on public.tasks
for select using (auth.uid() = owner_id);

create policy "tasks_owner_insert" on public.tasks
for insert with check (
  auth.uid() = owner_id
  and exists (select 1 from public.clients c where c.id = client_id and c.owner_id = auth.uid())
);

create policy "tasks_owner_update" on public.tasks
for update using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.clients c where c.id = client_id and c.owner_id = auth.uid())
);

create policy "tasks_owner_delete" on public.tasks
for delete using (auth.uid() = owner_id);

create index if not exists tasks_owner_client_idx on public.tasks(owner_id, client_id);
create index if not exists tasks_owner_due_idx on public.tasks(owner_id, due_date) where status <> 'completed';
