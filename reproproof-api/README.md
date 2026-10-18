# ReproProof API

## Target URL allowlist

Set `ALLOWED_TARGET_HOSTS` to comma-separated exact hostnames, for example
`localhost,127.0.0.1,staging.example.com`. Matching is case-insensitive and
does not include subdomains. An empty allowlist rejects every supplied target
with a response explaining how to configure it.

`ALLOWED_TARGET_PORTS` is a comma-separated list of permitted ports. The default
allows common web and local development ports, while excluding unrelated service
ports such as SSH and Redis. Add a port explicitly only for an approved HTTP
test service. Host and port checks apply to intake; a future browser runner must
also enforce destination checks after DNS resolution and on redirects.

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
