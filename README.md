# ReproProof

ReproProof collects bug reports, generates a reviewable browser plan, requires a server-recorded human decision, and runs approved plans through the Playwright worker. The frontend treats the API's run state and verification verdict as authoritative.

## Run locally

### Frontend and API in development

In one terminal, start the API:

```bash
cd reproproof-api
npm ci
cp .env.example .env
npm run dev
```

Set `APPROVAL_USERNAME` and `APPROVAL_PASSWORD` in `reproproof-api/.env` to test approvals. Reports and plans can use the in-memory store without Supabase; queued browser execution requires Supabase credentials and the SQL schema in `reproproof-api/supabase/schema.sql`.

In another terminal, from the repository root:

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. Vite uses `http://localhost:4000` for API calls in development. For a local app as a browser target, explicitly enable `ALLOW_INSECURE_LOCAL_TARGETS=true` and set `ALLOWED_TARGET_ORIGINS` in the API environment. Keep that option off outside local development.

### BugLab integration demo

BugLab is the supported controlled target for TC1–TC4. The report form loads its configurable origin from `GET /api/demo/buglab`; selecting a scenario fills the normal report fields and marks the report with `environment.demoScenario`. The API accepts that marker only when the URL matches `BUGLAB_BASE_URL` and the documented route. Plans still use the existing planner, hash approval, durable queue, Playwright worker, and Evidence Passport.

For Docker Desktop, run BugLab on the host so its loopback-only API remains private. Configure the same randomly generated reset token in `buglab/.env` and the root `.env`. In root `.env`, allow only `http://host.docker.internal:4173`, set `BUGLAB_BASE_URL` to that origin, set `VERIFICATION_RESET_URL` to its `/api/sandbox/reset` route, and enable `ALLOW_INSECURE_LOCAL_TARGETS=true` only with `APP_ENV=development`. BugLab's Vite web server must bind to `0.0.0.0` for the ReproProof container; its API continues to bind to loopback. Then:

```bash
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
docker compose up --build
```

Open `http://localhost:8080`. Nginx proxies `/api` and `/health` to the API container, so the frontend uses same-origin requests. Set the Supabase URL and service role key in the untracked root `.env` for durable reports, the queue, and private evidence storage. Never put server credentials in a `VITE_` variable.

## API workflow

| Screen/action | Endpoint | Behavior |
| --- | --- | --- |
| Submit a report | `POST /api/bugs` | Saves validated fields or returns clarification requests. |
| Load a report | `GET /api/bugs/:id` | Returns saved report details and environment. |
| Generate a plan | `POST /api/runs` with `{ "bugReportId": "…" }` | Returns the plan, hash, expiry, and `awaiting_approval` state. |
| Approve or reject | `POST /api/runs/:id/approve` | Uses configured HTTP Basic credentials; rejection cancels the run. |
| Queue execution | `POST /api/runs/:id/execute` | Returns `202`; the frontend polls for state and evidence. |
| Monitor a run | `GET /api/runs/:id` | Returns progress, attempts, sanitized telemetry, and the backend verdict. |
| Inspect evidence | `GET /api/runs/:id/evidence` | Returns metadata and authorized download URLs. |

Verdicts are `reproduced`, `not_reproduced`, or `inconclusive`. An infrastructure failure remains a separate `failed` run state; a successful HTTP response does not mean a bug was reproduced.

## Configuration and safety

- `VITE_API_BASE_URL` is optional for local Vite development. For a separately hosted API, set it at frontend build time. The Docker Compose setup uses the Nginx same-origin proxy by default.
- Configure `ALLOWED_TARGET_ORIGINS` and any necessary `ALLOWED_RESOURCE_ORIGINS` with exact approved origins. The default empty target allowlist rejects submissions.
- Production requires `APP_ENV=production`, HTTPS `CORS_ORIGIN`, and both Supabase settings. Keep approval credentials, model keys, and the Supabase service role key on the API server.
- Use synthetic accounts and approved sandbox targets. Mutating plans require the configured reset procedure before repeatability verification.

## Verification

```bash
# Frontend, from repository root
npm run build
npm run lint

# API
cd reproproof-api
npm test
npm run build
```

The QA scenario page reads live report/run state and links each scenario to the report form. Queued browser execution still requires the configured Supabase schema and credentials; the API intentionally refuses to execute an untracked run.

The full local integration test starts BugLab, the ReproProof frontend/API, and the Playwright worker, then submits, approves, executes, and checks all four scenarios. Point the root `.env` only at a dedicated isolated **TEST Supabase project**; the test creates and removes report/run rows and must never use production or customer data. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APPROVAL_USERNAME`, and `APPROVAL_PASSWORD` there. Apply `reproproof-api/supabase/schema.sql` and the queue migrations, including `202610210001_fix_claim_run_job_plan_hash_ambiguity.sql`, before running. If the required credentials are missing, the integration test is skipped and does not count as a pass. No values are printed by the test:

```bash
cd reproproof-api
npm run test:buglab-e2e
```

Evidence and the result summary are retained under the OS temporary directory printed at the end of the test.

If the worker logs `plan_hash is ambiguous`, apply the existing corrective function migration at `reproproof-api/supabase/migrations/202610210001_fix_claim_run_job_plan_hash_ambiguity.sql` in the configured Supabase project's SQL Editor. The queue schema is already present, but the function migration must also be applied for workers to claim runs. The integration test checks for this known migration drift before it creates test reports.
