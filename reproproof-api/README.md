# ReproProof API

## Target URL allowlist

Set `ALLOWED_TARGET_ORIGINS` to comma-separated exact HTTPS origins for verified,
authorized demo apps (for example, `https://demo.your-company.com`). Do not use
wildcards, local names, IP addresses, paths, credentials, query strings, or
fragments. An empty allowlist rejects every target. The API resolves approved
hosts and rejects private, loopback, link-local, reserved, and unresolved IP
addresses. Successful public DNS resolutions are cached per browser page for 60
seconds to avoid repeating lookups for each asset request.

For local development only, set `APP_ENV=development` and
`ALLOW_INSECURE_LOCAL_TARGETS=true`, then explicitly list local origins such as
`http://localhost:3000` in `ALLOWED_TARGET_ORIGINS`. Apply the same rule to any
local supporting origins in `ALLOWED_RESOURCE_ORIGINS`. The flag is rejected in
test and production environments; without it, HTTP and private/local targets
remain blocked. Keep the flag false for staging and production.

Set `ALLOWED_RESOURCE_ORIGINS` only to HTTPS origins required by that app's APIs
and static assets. The Playwright request guard allows those exact origins and
checks each request, including redirect hops; other origins and protocols are
aborted. Non-navigation `data:` image/font/audio/video assets and `blob:` assets
whose origin is allowlisted are permitted. The guard must be installed on a page
before its first navigation. Because Chromium performs its own DNS resolution,
application-level DNS checks cannot eliminate DNS-rebinding (TOCTOU) risk. Keep
container or network-level egress restrictions, including blocks for private,
link-local, and cloud metadata ranges, as a second boundary for the browser
process.

## Browser execution and evidence

After a run is approved, call `POST /api/runs/:id/execute`. The endpoint
atomically adds the approved plan to the shared Supabase `run_jobs` queue and
immediately returns `202 Accepted`. Poll `GET /api/runs/:id` for its queue,
attempt, and verification progress. Every API replica runs one queue worker;
Postgres `FOR UPDATE SKIP LOCKED` claims each job for exactly one worker, and
each worker processes one browser run at a time. Repeated execution requests
return the existing run and do not add another job. The worker verifies the
approved plan hash before execution.

Apply the full `supabase/schema.sql` after deploying this queue implementation.
It creates the durable queue table and service-role-only RPC functions used for
atomic enqueueing, claiming, heartbeats, completion, and stale-job recovery.
Runs whose workers lose their lease are marked `failed` and are not retried
automatically, because a browser may already have performed a destructive
action before the worker crashed. Review the saved attempt evidence before
creating a new approved run.
Each attempt is limited to 30 actions and two minutes;
individual page operations have bounded timeouts. A locator waits briefly for
its first match, then must match exactly one element before interaction, or the
run is marked inconclusive.

Two-run verification for state-modifying plans requires `VERIFICATION_RESET_URL`. Configure it to a
dedicated reset endpoint on the exact approved application origin. That endpoint
must reset only authorized disposable fixtures and return JSON
`{"reset":true}`; optional `VERIFICATION_RESET_TOKEN` stays server-side. The reset
procedure is added to the plan preconditions before approval, is called only
between two fresh browser contexts, and must confirm success before attempt 2.
Plans containing `click`, `fill`, or `select` require this matching approved
reset procedure; without it, execution is inconclusive and does not start an
attempt. Plans containing only navigation, waits, screenshots, and assertions
are explicitly marked read-only in their approval preconditions and may run
twice without an endpoint. Use that mode only for apps whose page-load behavior
is safe to repeat. For deletion scenarios, the configured endpoint must restore
the disposable fixture to its original state. It receives a JSON body
containing `runId` and `bugReportId`; keep any reset credential in the
server-side `VERIFICATION_RESET_TOKEN` setting, never in the URL.

Screenshots, the finalized WebM recording, separate console and network logs,
and a run report are written under `RUN_ARTIFACTS_DIR` (default
`artifacts/runs`). With Compose, the run data is mounted at
`./reproproof-api/artifacts` on the host. Every file has a sanitized evidence
record and can be retrieved at `GET /api/runs/:id/evidence/:evidenceId`. In
production, create `EVIDENCE_STORAGE_BUCKET` as a **private** Supabase Storage
bucket; downloads use signed URLs that expire after 60 seconds. Development
stores evidence locally. Request headers and bodies are not captured. Screenshots
and recordings can contain visible test data, so use synthetic accounts and
values in the browser. Screenshot captures mask password fields, fields marked
`data-sensitive="true"`, and credit-card autocomplete fields. Video recordings
are not visually redacted; their evidence records explicitly mark them as not
sanitized.

The plan schema accepts only typed browser actions. It rejects extra fields and
has no JavaScript, shell, or arbitrary-script action. Destructive actions such
as delete, remove, drop, and reset are converted to clarification-only steps
until a disposable sandbox and repeatable reset strategy can be verified.
Never put passwords, API keys, access tokens, or credential values in reports;
intake rejects those patterns before storage or model planning. Use synthetic
data or approved test accounts and keep credentials in server-side configuration
or a secret store.

## Storage

For persistent storage and browser execution, set both `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, then run [`supabase/schema.sql`](supabase/schema.sql)
in the Supabase SQL editor. The service role key is required by the shared job
queue and must stay on the API server only. Without Supabase, the API's local
in-memory report store can support intake development, but durable queueing and
browser execution are unavailable and reports do not survive restarts.

## Planner

The deterministic mock planner is the default and needs no model credentials.
To use OpenAI structured outputs, set `PLANNER_MODE=openai` and
`OPENAI_API_KEY`; `OPENAI_MODEL` defaults to `gpt-4o-mini`. The key stays on the
API server. Every model result is parsed by the plan Zod schema and checked
against the original report before a run is saved.

## Human approval

`POST /api/runs/:id/approve` requires HTTP Basic credentials configured with
`APPROVAL_USERNAME` and `APPROVAL_PASSWORD`. The username is the server-verified
approver recorded with the decision; identity is not accepted from the request
body. Approval expires after 24 hours. Rejection cancels the run. Plans are
fingerprinted with SHA-256, and the server checks that fingerprint again before
atomically claiming a run for execution. Keep these credentials server-side and
use HTTPS outside local development.
