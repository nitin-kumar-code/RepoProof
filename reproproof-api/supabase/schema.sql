create table if not exists public.bug_reports (
  id text primary key,
  report jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

create table if not exists public.test_runs (
  id text primary key,
  bug_report_id text not null references public.bug_reports (id),
  run jsonb not null,
  plan jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists test_runs_created_at_idx on public.test_runs (created_at desc);

alter table public.test_runs enable row level security;

-- The API accesses this table with the Supabase service role key. Do not expose
-- that key to the frontend or add public read/write policies for this table.
