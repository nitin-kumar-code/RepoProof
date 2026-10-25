# ReproProof

ReproProof turns a bug report into a reviewable browser plan, requires a server-recorded human approval, then runs the approved plan and records a verdict with evidence. `buglab/` is the repository's controlled synthetic target for the four hackathon scenarios.

## Hackathon judging demo

Use the complete setup, scenario walkthrough, reset steps, evidence locations, test commands, and troubleshooting guide in [`buglab/README.md`](buglab/README.md).

Verified local URL defaults:

- ReproProof Compose UI: `http://localhost:8080`
- ReproProof API: `http://localhost:4000`
- BugLab UI: `http://127.0.0.1:4173`
- BugLab API health: `http://127.0.0.1:4317/health`

No deployed/public URL is configured or verified. Compose configuration parses successfully, but the full Docker stack was not launched during this verification because Docker Desktop was unavailable. The configured Supabase project also needs the corrective queue-function migration before the worker can claim queued runs; see the guide for the exact file and setup steps.

## Quick start

From repository root, configure the ignored `.env` files using placeholder-only examples in `.env.example`, `reproproof-api/.env.example`, and `buglab/.env.example`. Docker Compose loads API secrets, including `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, from `reproproof-api/.env`; set both together there. Create a private Supabase Storage bucket and apply `reproproof-api/supabase/schema.sql` plus `reproproof-api/supabase/migrations/202610210001_fix_claim_run_job_plan_hash_ambiguity.sql` in the Supabase SQL Editor. Use a matching random reset token in the API and BugLab env files, plus locally created approval credentials. Never commit real secrets.

Start BugLab:

```bash
cd buglab && npm ci && npm run dev:api
```

In another terminal:

```bash
cd buglab && BUGLAB_WEB_HOST=0.0.0.0 npm run dev:web
```

Then from the repository root, with Docker running:

```bash
docker compose up --build
```

Open `http://localhost:8080`. The ReproProof API container reaches BugLab through `http://host.docker.internal:4173`; the host browser uses `http://127.0.0.1:4173` for BugLab directly.

## Application contracts

| Workflow | Endpoint | Behavior |
|---|---|---|
| Submit a report | `POST /api/bugs` | Validates and stores report. Optional `environment.demoScenario` supports `TC1`–`TC4` for the configured BugLab target. |
| Read report | `GET /api/bugs/:id` | Returns validated report/environment. |
| Generate plan | `POST /api/runs` | Saves plan/hash and returns `awaiting_approval`. |
| Approve/reject | `POST /api/runs/:id/approve` | Records server-verified configured Basic credentials and decision against plan hash. |
| Queue execution | `POST /api/runs/:id/execute` | Returns accepted response; client polls run state. |
| Read progress/verdict | `GET /api/runs/:id` | Returns progress, attempts, sanitized telemetry, and final result. |
| Read evidence | `GET /api/runs/:id/evidence` | Returns evidence metadata and authorized download URLs where configured. |

Verdicts are `reproduced`, `not_reproduced`, or `inconclusive`. Infrastructure errors use `failed`. A successful request alone does not establish reproduction.

## Checks

```bash
npm ci
npm run build
npm run lint
cd reproproof-api && npm ci && npm run build && npm test
cd ../buglab && npm ci && npm run build && npm run test:api && npm run test:e2e
```

The QA scenario page reads live report/run state and links each scenario to the report form. Queued browser execution still requires the configured Supabase schema and credentials; the API intentionally refuses to execute an untracked run.

The full local integration test starts BugLab, the ReproProof frontend/API, and the Playwright worker, then submits, approves, executes, and checks all four scenarios. Point the root `.env` only at a dedicated isolated **TEST Supabase project**; the test creates and removes report/run rows and must never use production or customer data. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APPROVAL_USERNAME`, and `APPROVAL_PASSWORD` there. Apply `reproproof-api/supabase/schema.sql` and the queue migrations, including `202610210001_fix_claim_run_job_plan_hash_ambiguity.sql`, before running. If the required credentials are missing, the integration test is skipped and does not count as a pass. No values are printed by the test:
The full integrated workflow is exercised with:

```bash
cd reproproof-api
npm run test:buglab-e2e
```

This integration test needs valid root `.env` Supabase and approval settings, applied schema and queue migration, and locally installed Playwright Chromium. See [`buglab/README.md`](buglab/README.md) for detailed prerequisites, E2E evidence outputs, troubleshooting, and current readiness limits.
