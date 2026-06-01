create table if not exists public.planner_blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

comment on table public.planner_blocks is
  'Local-first planner block mirror. Rows are soft-deleted by setting deleted_at and keeping the latest payload for last-write-wins sync.';

create index if not exists planner_blocks_user_updated_at_idx
  on public.planner_blocks (user_id, updated_at desc);

alter table public.planner_blocks enable row level security;

create policy "Users can read their planner blocks"
  on public.planner_blocks
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their planner blocks"
  on public.planner_blocks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their planner blocks"
  on public.planner_blocks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.planner_templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

comment on table public.planner_templates is
  'Local-first planner template mirror. Archived templates are represented by payload.isArchived and may also set deleted_at for cloud filtering.';

create index if not exists planner_templates_user_updated_at_idx
  on public.planner_templates (user_id, updated_at desc);

alter table public.planner_templates enable row level security;

create policy "Users can read their planner templates"
  on public.planner_templates
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their planner templates"
  on public.planner_templates
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their planner templates"
  on public.planner_templates
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
