-- The function's RETURNS TABLE output column named plan_hash shadows
-- runs.plan_hash inside PL/pgSQL. Qualify the table columns to remove the
-- ambiguity and allow the durable worker to claim queued runs.
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
      run = jsonb_set(coalesce(public.runs.run, '{}'::jsonb), '{status}', '"running"'::jsonb, true),
      updated_at = now()
      where public.runs.id = candidate.run_id
        and public.runs.status = 'approved'
        and public.runs.plan_hash = candidate.plan_hash;
    if found then
      return query select candidate.id, candidate.run_id, candidate.plan_hash;
      return;
    end if;

    update public.run_jobs set status = 'failed', completed_at = now(),
      error = 'Run was no longer approved when worker claimed it' where id = candidate.id;
  end loop;
end $$;

revoke all on function public.claim_next_run_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_run_job(text) to service_role;
