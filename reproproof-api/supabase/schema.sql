-- Bug input is kept as structured JSON. Large files live in the private
-- Supabase Storage bucket configured by EVIDENCE_STORAGE_BUCKET.
create table if not exists public.bug_reports (
  id text primary key,
  report jsonb not null,
  created_at timestamptz not null default now()
);

-- `run` contains the API representation; plan and lifecycle fields are
-- separate columns so transitions can use conditional atomic updates.
create table if not exists public.runs (
  id text primary key,
  bug_report_id text not null references public.bug_reports(id),
  run jsonb not null,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'awaiting_approval' check (status in (
    'pending', 'awaiting_approval', 'approved', 'cancelled', 'expired',
    'running', 'verifying', 'reproduced', 'not_reproduced', 'inconclusive',
    'failed', 'passed', 'error'
  )),
  plan_hash text not null,
  approval_expires_at timestamptz,
  approval jsonb
);

-- Upgrade installations that used the earlier `runs` layout from the setup
-- guide, and preserve existing `test_runs` rows when moving to this schema.
alter table public.runs add column if not exists run jsonb;
alter table public.runs add column if not exists plan jsonb;
alter table public.runs add column if not exists updated_at timestamptz not null default now();
alter table public.runs add column if not exists plan_hash text;
alter table public.runs add column if not exists approval_expires_at timestamptz;
alter table public.runs add column if not exists approval jsonb;

update public.runs r set run = jsonb_build_object(
  'id', r.id,
  'bugReportId', r.bug_report_id,
  'status', r.status,
  'browser', 'chromium',
  'createdAt', r.created_at,
  'updatedAt', r.updated_at,
  'planHash', coalesce(r.plan_hash, repeat('0', 64)),
  'approvalExpiresAt', coalesce(r.approval_expires_at, r.created_at + interval '24 hours'),
  'approval', r.approval,
  'execution', null
) where r.run is null;

do $$
begin
  if to_regclass('public.test_runs') is not null then
    execute $migration$
      insert into public.runs (id, bug_report_id, run, plan, created_at, updated_at, status, plan_hash, approval_expires_at, approval)
      select id, bug_report_id, run, plan, created_at, coalesce((run->>'updatedAt')::timestamptz, created_at),
        status, coalesce(plan_hash, repeat('0', 64)), approval_expires_at, approval
      from public.test_runs
      on conflict (id) do nothing
    $migration$;
  end if;
end $$;

alter table public.runs drop constraint if exists runs_status_check;
alter table public.runs add constraint runs_status_check check (status in (
  'pending', 'awaiting_approval', 'approved', 'cancelled', 'expired',
  'running', 'verifying', 'reproduced', 'not_reproduced', 'inconclusive',
  'failed', 'passed', 'error'
));

create table if not exists public.attempts (
  id text primary key,
  run_id text not null references public.runs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('completed', 'inconclusive', 'failed')),
  result jsonb not null,
  fingerprint jsonb,
  fingerprint_hash text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (run_id, attempt_number)
);

create table if not exists public.evidence_files (
  id text primary key,
  run_id text not null references public.runs(id) on delete cascade,
  attempt_id text references public.attempts(id) on delete set null,
  attempt_number integer not null check (attempt_number > 0),
  type text not null check (type in ('video', 'screenshot', 'console', 'network', 'report')),
  storage_key text not null unique,
  sanitized boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Durable queue shared by all API/worker replicas. A job is never reclaimed
-- for execution after it leaves queued; stale processing jobs are failed to
-- avoid repeating a possibly destructive browser action.
create table if not exists public.run_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique references public.runs(id) on delete cascade,
  plan_hash text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  worker_id text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz
);

create index if not exists runs_created_at_idx on public.runs(created_at desc);
create index if not exists runs_status_idx on public.runs(status);
create unique index if not exists runs_one_active_per_bug_idx on public.runs(bug_report_id)
  where status in ('awaiting_approval', 'approved', 'running', 'verifying');
create index if not exists attempts_run_id_idx on public.attempts(run_id, attempt_number);
create index if not exists evidence_files_run_id_idx on public.evidence_files(run_id, created_at);
create index if not exists run_jobs_claim_idx on public.run_jobs(status, created_at) where status = 'queued';
create index if not exists run_jobs_heartbeat_idx on public.run_jobs(status, heartbeat_at) where status = 'processing';

alter table public.run_jobs enable row level security;

create or replace function public.enqueue_approved_run(p_run_id text, p_plan_hash text)
returns public.run_jobs
language plpgsql
security definer
set search_path = public
as $$
declare job public.run_jobs;
begin
  insert into public.run_jobs(run_id, plan_hash)
  select r.id, r.plan_hash from public.runs r
  where r.id = p_run_id and r.status = 'approved' and r.plan_hash = p_plan_hash
    and r.approval->>'decision' = 'approved' and r.approval->>'planHash' = r.plan_hash
  on conflict (run_id) do nothing;

  select * into job from public.run_jobs where run_id = p_run_id;
  if job.id is null then
    raise exception 'run_not_approved_or_plan_changed';
  end if;
  if job.plan_hash <> p_plan_hash then
    raise exception 'run_plan_changed';
  end if;

  update public.runs set run = jsonb_set(
    coalesce(run, '{}'::jsonb), '{progress}',
    jsonb_build_object('phase', 'queued', 'currentAttempt', null, 'completedAttempts', 0,
      'completedActions', 0, 'totalActions', jsonb_array_length(coalesce(plan->'steps', '[]'::jsonb)),
      'message', 'Waiting for an available browser worker', 'updatedAt', now()), true
  ), updated_at = now()
  where id = p_run_id and status = 'approved' and plan_hash = p_plan_hash;
  return job;
end $$;

create or replace function public.claim_next_run_job(p_worker_id text)
returns table(job_id uuid, run_id text, plan_hash text)
language plpgsql
security definer
set search_path = public
as $$
declare candidate public.run_jobs;
begin
  loop
    select * into candidate from public.run_jobs j where j.status = 'queued'
      order by j.created_at limit 1 for update skip locked;
    if candidate.id is null then return; end if;

    update public.run_jobs set status = 'processing', worker_id = p_worker_id,
      started_at = now(), heartbeat_at = now(), error = null where id = candidate.id;
    update public.runs set status = 'running',
      run = jsonb_set(coalesce(run, '{}'::jsonb), '{status}', '"running"'::jsonb, true),
      updated_at = now()
      where id = candidate.run_id and status = 'approved' and plan_hash = candidate.plan_hash;
    if found then
      return query select candidate.id, candidate.run_id, candidate.plan_hash;
      return;
    end if;

    update public.run_jobs set status = 'failed', completed_at = now(),
      error = 'Run was no longer approved when worker claimed it' where id = candidate.id;
  end loop;
end $$;

create or replace function public.heartbeat_run_job(p_job_id uuid, p_worker_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with renewed as (
    update public.run_jobs set heartbeat_at = now()
    where id = p_job_id and worker_id = p_worker_id and status = 'processing'
    returning id
  ) select exists(select 1 from renewed)
$$;

create or replace function public.finish_run_job(p_job_id uuid, p_worker_id text, p_succeeded boolean, p_error text default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  with finished as (
    update public.run_jobs set status = case when p_succeeded then 'completed' else 'failed' end,
      completed_at = now(), heartbeat_at = now(), error = left(p_error, 2000)
    where id = p_job_id and worker_id = p_worker_id and status = 'processing'
    returning id
  ) select exists(select 1 from finished)
$$;

create or replace function public.recover_stale_run_jobs(p_stale_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare recovered integer;
begin
  update public.run_jobs j set status = 'failed', completed_at = now(),
    error = 'Worker lease expired; execution was not retried to prevent duplicate browser actions'
  where j.status = 'processing' and j.heartbeat_at < p_stale_before;
  get diagnostics recovered = row_count;

  update public.runs r set status = 'failed', updated_at = now(),
    run = jsonb_set(jsonb_set(coalesce(r.run, '{}'::jsonb), '{status}', '"failed"'::jsonb, true),
      '{progress}', jsonb_build_object('phase', 'completed', 'currentAttempt', null,
        'completedAttempts', coalesce(jsonb_array_length(r.run #> '{execution,attempts}'), 0),
        'completedActions', coalesce((r.run #>> '{progress,completedActions}')::integer, 0),
        'totalActions', coalesce((r.run #>> '{progress,totalActions}')::integer, 0),
        'message', 'Worker lease expired; execution failed', 'updatedAt', now()), true)
  where r.status = 'running' and r.updated_at < p_stale_before
    and not exists (select 1 from public.run_jobs j where j.run_id = r.id and j.status = 'processing');

  update public.runs r set status = case
      when jsonb_array_length(coalesce(r.run #> '{execution,attempts}', '[]'::jsonb)) = 2
        and not exists (
          select 1 from jsonb_array_elements(coalesce(r.run #> '{execution,attempts}', '[]'::jsonb)) as attempts(value)
          where value->>'completed' <> 'true'
        )
        and r.run #>> '{execution,result}' in ('reproduced', 'not_reproduced', 'inconclusive')
      then r.run #>> '{execution,result}' else 'failed' end,
    updated_at = now(),
    run = jsonb_set(coalesce(r.run, '{}'::jsonb), '{status}', to_jsonb(case
      when jsonb_array_length(coalesce(r.run #> '{execution,attempts}', '[]'::jsonb)) = 2
        and not exists (
          select 1 from jsonb_array_elements(coalesce(r.run #> '{execution,attempts}', '[]'::jsonb)) as attempts(value)
          where value->>'completed' <> 'true'
        )
        and r.run #>> '{execution,result}' in ('reproduced', 'not_reproduced', 'inconclusive')
      then r.run #>> '{execution,result}' else 'failed' end), true)
  where r.status = 'verifying' and r.updated_at < p_stale_before
    and not exists (select 1 from public.run_jobs j where j.run_id = r.id and j.status = 'processing');
  return recovered;
end $$;

revoke all on function public.enqueue_approved_run(text, text) from public, anon, authenticated;
revoke all on function public.claim_next_run_job(text) from public, anon, authenticated;
revoke all on function public.heartbeat_run_job(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_run_job(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.recover_stale_run_jobs(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_approved_run(text, text) to service_role;
grant execute on function public.claim_next_run_job(text) to service_role;
grant execute on function public.heartbeat_run_job(uuid, text) to service_role;
grant execute on function public.finish_run_job(uuid, text, boolean, text) to service_role;
grant execute on function public.recover_stale_run_jobs(timestamptz) to service_role;

alter table public.bug_reports enable row level security;
alter table public.runs enable row level security;
alter table public.attempts enable row level security;
alter table public.evidence_files enable row level security;

-- The API uses the service role key server-side. Do not expose that key or add
-- public policies. Create EVIDENCE_STORAGE_BUCKET as a private Storage bucket.
