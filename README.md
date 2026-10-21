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

The UI includes the four acceptance scenario specifications, but these are labeled as not executed until real backend runs exist. A full browser run also requires configured Supabase queue/storage and an allowlisted target; without them, the API intentionally refuses durable execution.
