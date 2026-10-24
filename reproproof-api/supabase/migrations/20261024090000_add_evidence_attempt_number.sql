-- Backfill the evidence attempt number added by the current API schema.
-- Safe for databases where the column already exists.
alter table public.evidence_files add column if not exists attempt_number integer;

update public.evidence_files e set attempt_number = coalesce(
  (select a.attempt_number from public.attempts a where a.id = e.attempt_id),
  nullif(substring(e.storage_key from '/attempt-([0-9]+)/'), '')::integer,
  1
) where e.attempt_number is null;

alter table public.evidence_files alter column attempt_number set default 1;
alter table public.evidence_files alter column attempt_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'evidence_files_attempt_number_check'
      and conrelid = 'public.evidence_files'::regclass
  ) then
    alter table public.evidence_files add constraint evidence_files_attempt_number_check
      check (attempt_number > 0);
  end if;
end $$;
