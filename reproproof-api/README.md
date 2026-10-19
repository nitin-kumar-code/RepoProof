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
atomically claims the approved plan and immediately returns `202 Accepted` with
the run in `running` state. Poll `GET /api/runs/:id` until it reaches a final
state. The background attempt starts one isolated Chromium context and executes
the approved typed actions in order; it rejects an unapproved, changed, or
already claimed plan. Only one browser attempt runs at a time in each API
process; concurrent execution requests receive `409 browser_executor_busy`.
Each attempt is limited to 30 actions and two minutes;
individual page operations have bounded timeouts. A locator waits briefly for
its first match, then must match exactly one element before interaction, or the
run is marked inconclusive.

Screenshots, the finalized WebM recording, and sanitized telemetry are written
under `RUN_ARTIFACTS_DIR` (default `artifacts/runs`). With Compose, the run data
is mounted at `./reproproof-api/artifacts` on the host. The run response records
relative file references and telemetry metadata; request headers and bodies are
not captured. The API serves only files listed in the run's evidence record at
`GET /api/runs/:id/artifacts/:kind/:file`. Treat screenshots and recordings as
sensitive because they may contain the approved test app's visible data.

The plan schema accepts only typed browser actions. It rejects extra fields and
has no JavaScript, shell, or arbitrary-script action. Destructive actions such
as delete, remove, drop, and reset are converted to clarification-only steps
until a disposable sandbox and repeatable reset strategy can be verified.
Never put passwords, API keys, access tokens, or credential values in reports;
intake rejects those patterns before storage or model planning. Use synthetic
data or approved test accounts and keep credentials in server-side configuration
or a secret store.

## Storage

For persistent storage, set both `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, then run [`supabase/schema.sql`](supabase/schema.sql)
in the Supabase SQL editor. Keep the service role key on the API server only.
If Supabase is not configured, the API uses an in-memory store for local
development; those reports do not survive restarts.

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
