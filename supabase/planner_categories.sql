-- Cloud mirror for planner categories (colours + names), so a signed-in user's
-- categories — and therefore their event colours — follow them across devices.
-- Same local-first / last-write-wins shape and RLS as public.planner_blocks
-- (see schema.sql). Run this once in the Supabase SQL editor.

create table if not exists public.planner_categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

comment on table public.planner_categories is
  'Local-first planner category mirror. Rows are soft-deleted by setting deleted_at and keeping the latest payload for last-write-wins sync.';

create index if not exists planner_categories_user_updated_at_idx
  on public.planner_categories (user_id, updated_at desc);

alter table public.planner_categories enable row level security;

create policy "Users can read their planner categories"
  on public.planner_categories
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their planner categories"
  on public.planner_categories
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their planner categories"
  on public.planner_categories
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
