# Vercel + Render + Supabase deployment

This repository now has deployment configuration for the existing split: static ReproProof and BugLab frontends, ReproProof's Playwright API/worker, and BugLab's synthetic API. Supabase remains the durable queue, database, and private evidence store. This guide uses the generated Vercel and Render hostnames first; custom domains can be added after the first successful deploy.

## 1. Prepare Supabase

In the Supabase project SQL Editor, run these files in order:

1. `reproproof-api/supabase/schema.sql`
2. `reproproof-api/supabase/migrations/202610210001_fix_claim_run_job_plan_hash_ambiguity.sql`
3. `reproproof-api/supabase/migrations/20261024090000_add_evidence_attempt_number.sql`

Create a private Storage bucket named `reproproof-evidence`. Copy the project URL and the **service-role** key for the Render API environment only. Never add that key to Vercel or a `VITE_` variable.

## 2. Deploy the ReproProof frontend to Vercel

Import this GitHub repository as a Vercel project with:

- Root Directory: repository root (`.`)
- Framework preset: Vite (or Other)
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Production environment variable: `VITE_API_BASE_URL` (set after deploying the API in Step 4)

`vercel.json` supplies the SPA fallback needed for routes such as `/runs/...` and `/evidence/...`. Keep the project private or protected while configuring secrets and approvals.

## 3. Deploy BugLab's frontend to Vercel

Create a second Vercel project from the same Git repository:

- Root Directory: `buglab`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Production environment variable: `VITE_BUGLAB_API_BASE_URL` (set after deploying BugLab's API in Step 4)

`buglab/vercel.json` provides the SPA fallback. The frontend calls the separately hosted BugLab API using this build-time variable.

Deploy both projects once to obtain their initial Vercel URLs. The frontend URLs will be the exact `CORS_ORIGIN`, `BUGLAB_BASE_URL`, and `BUGLAB_UI_ORIGINS` values below.

## 4. Deploy both APIs on Render

In Render, choose **New → Blueprint** and connect this repository. The root `render.yaml` defines two services:

- `reproproof-api`: Docker image from the official Playwright base, HTTP API and its existing single-process durable-queue worker. It is configured as one 2 CPU / 4 GB instance.
- `buglab-api`: Node API service, one instance because its controlled fixtures are in memory. It requires server-side approval credentials before enabling public binding.

Render's `sync: false` variables must be entered in the Render dashboard and are not stored in this repository. For the initial deployment, set the service variables as follows, using the actual provider URLs:

### ReproProof API service

| Variable | Value |
|---|---|
| `APP_ENV` | `production` (already in Blueprint) |
| `PORT` | `10000` (already in Blueprint) |
| `CORS_ORIGIN` | Exact ReproProof Vercel origin, e.g. `https://your-reproof-project.vercel.app` |
| `BUGLAB_BASE_URL` | Exact BugLab frontend Vercel origin |
| `ALLOWED_TARGET_ORIGINS` | Same exact BugLab frontend origin |
| `BUGLAB_API_BASE_URL` | Exact BugLab Render API origin |
| `ALLOWED_RESOURCE_ORIGINS` | Exact BugLab Render API origin |
| `VERIFICATION_RESET_URL` | `<BugLab Render API origin>/api/sandbox/reset` |
| `VERIFICATION_RESET_TOKEN` | Random secret of at least 32 characters; match the BugLab API value |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-only service-role key |
| `APPROVAL_USERNAME` | New judge/demo username |
| `APPROVAL_PASSWORD` | Long random password, at least 12 characters |

Keep `PLANNER_MODE=mock` for the deterministic demo; no model API key is required. Configure the evidence bucket name as `reproproof-evidence`.

### BugLab API service

| Variable | Value |
|---|---|
| `APP_ENV` | `production` (already in Blueprint) |
| `PORT` | `10000` (already in Blueprint) |
| `BUGLAB_HOST` | `0.0.0.0` (already in Blueprint) |
| `BUGLAB_PUBLIC_DEPLOYMENT` | `true` (already in Blueprint) |
| `BUGLAB_UI_ORIGINS` | Exact BugLab Vercel origin |
| `BUGLAB_RESET_TOKEN` | Same random secret as `VERIFICATION_RESET_TOKEN` |
| `BUGLAB_APPROVAL_USERNAME` | Same value as ReproProof `APPROVAL_USERNAME` |
| `BUGLAB_APPROVAL_PASSWORD` | Same value as ReproProof `APPROVAL_PASSWORD` |

TC3 destructive approval requests require these credentials, exact same-origin checks, a typed confirmation, a current seeded record snapshot, and a one-use action/version/hash-bound approval. The browser runner sends the credentials only to the configured BugLab API origin after the ReproProof plan has been approved. Do not use a personal or reused password. The demo uses a shared staging identity; it is not multi-user identity management.

## 5. Connect the frontends to the API URLs

After both Render services are live, copy their exact HTTPS origins from Render:

- In the ReproProof Vercel project, set `VITE_API_BASE_URL` to the ReproProof API origin.
- In the BugLab Vercel project, set `VITE_BUGLAB_API_BASE_URL` to the BugLab API origin.
- In the ReproProof Render service, set the exact `CORS_ORIGIN`, target/resource origins, `BUGLAB_BASE_URL`, `BUGLAB_API_BASE_URL`, and reset URL as shown above.
- In the BugLab Render service, set `BUGLAB_UI_ORIGINS` to the BugLab frontend origin.

Redeploy both Vercel projects after setting the `VITE_` variables; these are embedded at build time. Redeploy or restart Render services after changing runtime variables.

## 6. Add custom DNS names (optional)

First verify the generated platform URLs work. Then, in Vercel and Render dashboards, add your chosen custom domains to each service. Use the exact DNS records those dashboards display; records vary by domain provider and service. Add each required A, AAAA, or CNAME record at your DNS provider, wait for propagation, and wait for the platform to report TLS as active.

After the custom domains resolve over HTTPS, update every origin above to the exact custom origin and redeploy. Do not include a path or trailing slash in origin allowlists. The reset URL is the only value that includes `/api/sandbox/reset`.

## 7. Verify the public workflow

From a terminal, check both API health endpoints:

```bash
curl -fsS https://YOUR_REPROPROOF_API/health
curl -fsS https://YOUR_BUGLAB_API/health
```

Then open the ReproProof frontend and verify:

1. API health is online and `GET /api/demo/buglab` reports the configured target.
2. A report can be submitted and its proposed plan is shown before approval.
3. An unapproved run cannot execute; approve it with the configured demo credentials.
4. TC1 runs two attempts with reset between attempts and comparable fingerprints.
5. TC2 completes as `not_reproduced` when its failure is absent.
6. TC3 rejects unauthenticated/direct deletion, records the approver, and deletes only the specifically approved synthetic record.
7. TC4 redacts its synthetic token in stored text evidence; media without reliable visual sanitization remains restricted.
8. Evidence download links work through the private Supabase bucket.

Inspect Render logs if checks fail. Do not treat HTTP 202 or a successful API response as a completed browser verdict; poll `GET /api/runs/:id` until the run reaches a terminal state.

## 8. Netlify alternative

Instead of Vercel, the root `netlify.toml` supports the ReproProof static frontend. Create a Netlify site with base directory `.`, build command `npm run build`, publish directory `dist`, and `VITE_API_BASE_URL` set to the Render ReproProof API origin. A second site can use base directory `buglab`, publish directory `dist`, and `VITE_BUGLAB_API_BASE_URL` set to the Render BugLab API origin. Set the corresponding allowed origins in Render before using either site.

## Deployment boundaries

- The deployed URLs do not exist until the Render and Vercel projects are created and deployed; no public URLs or live test results are claimed here.
- BugLab's synthetic cart, logs, and seed records are in memory and reset on process restart. Keep exactly one BugLab instance.
- The ReproProof runner is a single sequential worker in its API process. Supabase is the durable queue; Render local storage is not the evidence source of truth.
- The shared judge credential is suitable only for a controlled staging demo. Use Supabase Auth or another per-user identity provider before a broad public production launch.
- These platform configuration files do not create provider accounts, purchase plans, create DNS records, or write secrets into dashboards.
