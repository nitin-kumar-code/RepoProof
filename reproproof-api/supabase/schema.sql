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
  created_at timestamptz not null default now(),
  status text not null default 'awaiting_approval',
  plan_hash text,
  approval_expires_at timestamptz,
  approval jsonb
);

alter table public.test_runs add column if not exists status text not null default 'awaiting_approval';
alter table public.test_runs add column if not exists plan_hash text;
alter table public.test_runs add column if not exists approval_expires_at timestamptz;
alter table public.test_runs add column if not exists approval jsonb;

create index if not exists test_runs_created_at_idx on public.test_runs (created_at desc);
create index if not exists test_runs_status_idx on public.test_runs (status);

alter table public.test_runs enable row level security;

-- The API accesses this table with the Supabase service role key. Do not expose
-- that key to the frontend or add public read/write policies for this table.
