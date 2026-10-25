# ReproProof + BugLab Hackathon Demo

This guide covers the controlled, synthetic BugLab target and its integration with ReproProof. There is **no verified public deployment URL**. Verified local defaults are BugLab `http://127.0.0.1:4173`, its API health check `http://127.0.0.1:4317/health`, and the Docker Compose ReproProof UI `http://localhost:8080` (Compose config validated; the complete Compose stack was not run in this environment because Docker Desktop was unavailable).

## Prerequisites

- macOS, Linux, or Windows with Docker Desktop/Engine and Compose v2 for the integrated demo.
- Node.js 20.19+ (or 22.12+) and npm.
- Git checkout with dependencies installed using `npm ci`.
- Supabase project configured for persistent runs, queue, and private evidence. Apply `reproproof-api/supabase/schema.sql` and the corrective migration `reproproof-api/supabase/migrations/202610210001_fix_claim_run_job_plan_hash_ambiguity.sql` in that project's SQL Editor. The second migration is required for workers to claim queued runs.
- Chromium: the API Docker image supplies Playwright browser dependencies. For host-side BugLab E2E tests, install once with `cd buglab && npx playwright install chromium`.

## Configure the demo

Create the local env files; they are ignored by Git:

```bash
cp .env.example .env
cp buglab/.env.example buglab/.env
```

Use the same newly generated random reset token in both files. In root `.env`, set these development-only values (keep the Supabase URL and service-role key private):

```dotenv
APP_ENV=development
ALLOW_INSECURE_LOCAL_TARGETS=true
BUGLAB_BASE_URL=http://host.docker.internal:4173
ALLOWED_TARGET_ORIGINS=http://host.docker.internal:4173
ALLOWED_RESOURCE_ORIGINS=http://host.docker.internal:4173
VERIFICATION_RESET_URL=http://host.docker.internal:4173/api/sandbox/reset
VERIFICATION_RESET_TOKEN=<same-random-token-as-buglab>
APPROVAL_USERNAME=<judge-reviewer-name>
APPROVAL_PASSWORD=<private-password-at-least-12-characters>
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
```

In `buglab/.env`, use placeholders replaced with your own local values:

```dotenv
BUGLAB_HOST=127.0.0.1
BUGLAB_PORT=4317
BUGLAB_WEB_HOST=0.0.0.0
BUGLAB_RESET_TOKEN=<same-random-token-as-root>
BUGLAB_UI_ORIGINS=http://host.docker.internal:4173,http://localhost:4173,http://127.0.0.1:4173
VITE_BUGLAB_API_PROXY=http://127.0.0.1:4317
BUGLAB_APPROVAL_USERNAME=<same-as-ReproProof-APPROVAL_USERNAME>
BUGLAB_APPROVAL_PASSWORD=<same-as-ReproProof-APPROVAL_PASSWORD>
```

The approval username/password are verified by both ReproProof's plan approval endpoint and BugLab's destructive-action endpoints. BugLab requires them for exact-record deletion approvals; its public Render service fails to start without them. They are operator-created synthetic demo credentials, not published defaults. Do not commit either `.env`, expose the Supabase service key in the browser, or use these development HTTP settings in production.

## Start the complete local demo

Terminal 1, from the repository root:

```bash
cd buglab
npm ci
npm run dev:api
```

Terminal 2:

```bash
cd buglab
BUGLAB_WEB_HOST=0.0.0.0 npm run dev:web
```

Terminal 3, from repository root, after Docker is running:

```bash
docker compose up --build
```

Open ReproProof at `http://localhost:8080`. BugLab is `http://127.0.0.1:4173` on the host; the ReproProof container reaches it at `http://host.docker.internal:4173`. Vite proxies BugLab API requests to its loopback API. ReproProof API is also mapped to `http://localhost:4000`.

Check health:

```bash
curl http://127.0.0.1:4317/health
curl http://localhost:4000/health
```

## Scenarios and reset

| ID | Steps | Expected outcome |
| --- | --- | --- |
| **TC1** | Reset; add Alpine Trail Backpack twice; open cart. Repeat from a fresh/reset state. | Reproduced twice: quantity 2, subtotal 6,400 cents rather than expected 12,800 cents; stable normalized fingerprint. |
| **TC2** | Reset; add one backpack; open cart. | The zero-subtotal claim is absent; completed run is `not_reproduced`, not a claim that the defect was fixed. |
| **TC3** | Open `/sandbox`; select `sandbox-order-001`; attempt unapproved delete (must be denied); then approve the exact disposable record and execute. | Only the approved synthetic record is deleted. Rejected/expired/stale/replayed or modified approval must fail. Reset restores all three seeded records. |
| **TC4** | Open `/scenarios/TC4`; load the synthetic token fixture; inspect sanitized logs and masked screenshot. | Token-like text is redacted from text evidence. Screenshot masking is applied. ReproProof video capture is disabled because frame-level redaction is unavailable. |

TC3's destructive actions remain constrained to the configured BugLab origin and `/sandbox` route, with a second approval at BugLab bound to exact action, record IDs, state version, and plan hash. TC4 uses only its synthetic fixture. ReproProof masks the `[data-sensitive="true"]` element in screenshots and sanitizes text evidence. The approved synthetic TC1 scenario may record video, but those recordings stay local and restricted because reliable frame-level redaction is unavailable; TC2–TC4 remain video-free.

Reset manually from BugLab's Sandbox screen or call its same-origin UI reset:

```bash
curl -X POST http://127.0.0.1:4317/api/sandbox/ui-reset \
  -H 'Origin: http://127.0.0.1:4173' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' --data '{}'
```

ReproProof's verifier calls `/api/sandbox/reset` with the configured bearer reset token and resets only BugLab's in-memory synthetic fixtures. Restarting BugLab's API also restores its seed data. No external/customer data is involved.

## Judge demo sequence

1. On **New Bug Report**, choose TC1 and submit. Show the generated plan and target to the judge before approval.
2. Attempt to execute before approval if demonstrating the gate; show that the backend rejects it. Approve with the configured reviewer credentials, then execute.
3. Wait for a terminal verdict. Show two separate attempts, clean resets, the matching fingerprint, and observed cart values. For **two independent TC1 runs**, submit TC1 again as a new report/run and repeat approval; do not describe the two attempts inside one run as two separate runs.
4. Submit TC2 and show the completed `not_reproduced` result and the one-item subtotal evidence.
5. Submit TC3. Show the unapproved deletion denial, the exact record/action approval prompt, then the approved deletion and reset-restored fixture.
6. Submit TC4. Show sanitized console/network/report evidence and the masked screenshot. State clearly that ReproProof does not record video.

## Evidence and reports

- In ReproProof, open the completed run and its Evidence Passport. `GET /api/runs/:id/evidence` lists evidence metadata/download links; run details include attempts, progress, verdict, and sanitized telemetry.
- ReproProof writes local run artifacts under `RUN_ARTIFACTS_DIR` (Compose maps this to `./reproproof-api/artifacts` on the host). Supabase evidence storage must be configured as a **private** bucket for durable download links. Video is disabled and unsanitized media is restricted.
- BugLab E2E evidence is written to `${os.tmpdir()}/buglab-evidence/acceptance-<timestamp>/`. Each `TC1`–`TC4` directory contains a `verification-report.json`; TC1 contains per-attempt screenshots and browser recordings, TC2 a screenshot and optional recording, TC4 a masked screenshot and sanitized log export. Inspect the report for the exact file paths. TC4 CSS-only media and videos are explicitly marked restricted/unverified; do not share them as sanitized evidence.
- The integrated ReproProof test prints an `integration-summary.json` location only after all four scenarios finish. No such successful integrated summary exists until the queue migration is applied and the test passes.

## Automated tests

From repository root:

```bash
npm ci
npm run build
npm run lint
```

API:

```bash
cd reproproof-api
npm ci
npm run build
npm test
npm run test:buglab-e2e
```

BugLab API and real-browser scenarios:

```bash
cd buglab
npm ci
npx playwright install chromium   # one-time if Chromium is absent
npm run build
npm run test:api
npm run test:e2e
```

`test:buglab-e2e` requires the root `.env`, valid Supabase credentials/schema/queue migration, approval credentials, Docker-independent local ports, and installed Chromium. It starts temporary BugLab and ReproProof services itself. It will not complete the end-to-end run while the deployed queue function is stale.

## Troubleshooting and known limitations

- **Docker connection error:** start Docker Desktop and wait until `docker info` succeeds; `docker compose config --quiet` checks Compose syntax but does not start containers.
- **Browser missing:** inside Docker rebuild the API image; for host E2E run `npx playwright install chromium` from `buglab/`.
- **Target rejected / demo disabled:** confirm `BUGLAB_BASE_URL` exactly matches an entry in `ALLOWED_TARGET_ORIGINS`. For Docker Desktop use `http://host.docker.internal:4173`, allow that same origin in `ALLOWED_RESOURCE_ORIGINS`, set development-only insecure local targets, and restart the API/container after env changes.
- **Run stays queued:** apply the queue function migration named above in Supabase SQL Editor, then restart the ReproProof API/Compose service. A queued HTTP 202 is not proof of execution.
- **Reset rejected:** confirm the exact same random token is configured in root and BugLab env files; restart both services. Never paste the token into a report or evidence.
- **No screenshots/evidence:** wait until the run is terminal and inspect attempt completion. If no terminal run exists, first check worker health and queue errors. Text evidence and screenshots are separate records; videos are disabled in ReproProof.
- **No deployed URL:** none has been verified or configured for this repository. Use the local URLs above; do not present them as public links.
- BugLab uses in-memory synthetic fixtures. It is a controlled demo, not an authenticated production store. TC1 intentionally contains a defect. TC4 uses a fake token. ReproProof's repeatable destructive tests require reset support. Evidence sharing depends on private Supabase Storage; local-only evidence remains local.
