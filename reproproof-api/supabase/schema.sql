create table if not exists public.bug_reports (
  id text primary key,
  report jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

-- The API accesses this table with the Supabase service role key. Do not expose
-- that key to the frontend or add public read/write policies for this table.
