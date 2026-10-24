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

From repository root, configure the ignored `.env` files using placeholder-only examples in `.env.example` and `buglab/.env.example`. Create a private Supabase Storage bucket and apply `reproproof-api/supabase/schema.sql` plus `reproproof-api/supabase/migrations/202610210001_fix_claim_run_job_plan_hash_ambiguity.sql` in the Supabase SQL Editor. Use a matching random reset token in the root and BugLab env files, plus locally created approval credentials. Never commit real secrets.

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
<<<<<<< HEAD
cd buglab
npm ci
# Terminal 1: configure BUGLAB_RESET_TOKEN and BUGLAB_UI_ORIGINS in buglab/.env
npm run dev:api
# Terminal 2: BUGLAB_WEB_HOST=0.0.0.0 npm run dev:web
```

In another terminal, from the repository root, start the ReproProof stack with `docker compose up --build`, open `http://localhost:8080`, select TC1–TC4 on **New Bug Report**, review the proposed plan, approve it, and run it. TC3 first attempts an unapproved API delete and then requires BugLab's exact record-set approval for the disposable fixture. TC1 and TC3 reset before both attempts. The runner records masked screenshots and sanitized request/response metadata. It records video only for the approved synthetic TC1 BugLab scenario; those recordings are marked unsanitized, remain local and restricted, are not uploaded to Supabase Storage, and cannot be downloaded or shared until a frame-review pipeline exists. Other scenarios, including TC4, do not record video.

### Docker Compose

From the repository root:

```bash
cp .env.example .env
# Edit .env with approved target origins, approval credentials, and Supabase values as needed.
=======
>>>>>>> cb06554f291a62c9ebd455e57ec3b9ae815edf8a
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

<<<<<<< HEAD
The QA scenario page reads live report/run state and links each scenario to the report form. Queued browser execution still requires the configured Supabase schema and credentials; the API intentionally refuses to execute an untracked run.

The full local integration test starts BugLab, the ReproProof frontend/API, and the Playwright worker, then submits, approves, executes, and checks all four scenarios. Point the root `.env` only at a dedicated isolated **TEST Supabase project**; the test creates and removes report/run rows and must never use production or customer data. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APPROVAL_USERNAME`, and `APPROVAL_PASSWORD` there. Apply `reproproof-api/supabase/schema.sql` and the queue migrations, including `202610210001_fix_claim_run_job_plan_hash_ambiguity.sql`, before running. If the required credentials are missing, the integration test is skipped and does not count as a pass. No values are printed by the test:
=======
The full integrated workflow is exercised with:
>>>>>>> cb06554f291a62c9ebd455e57ec3b9ae815edf8a

```bash
cd reproproof-api
npm run test:buglab-e2e
```

This integration test needs valid root `.env` Supabase and approval settings, applied schema and queue migration, and locally installed Playwright Chromium. See [`buglab/README.md`](buglab/README.md) for detailed prerequisites, E2E evidence outputs, troubleshooting, and current readiness limits.
