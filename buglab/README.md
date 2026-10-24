# BugLab for ReproProof

BugLab is a small, isolated e-commerce-style demo target for testing ReproProof. It uses deterministic synthetic data and contains one deliberate cart defect. Its API, store, and UI live entirely in `buglab/`; it does not connect to the main app's database or any payment service.

## Architecture

```text
buglab/
├── server/       Express API, in-memory seeded store, approval and redaction logic
├── shared/       Scenario definitions and synthetic fixture contracts
├── web/          React UI and responsive styles
├── tests/        API tests and browser-level scenario tests
└── package.json  Independent dependencies and scripts
```

The Express API binds to `127.0.0.1` by default and rejects non-loopback API requests. Vite binds to `127.0.0.1:4173` and proxies `/api` to the API on port `4317`. Data is memory-only and resets to fixed seed values when asked; restarting the API also returns the store to its seed state.

## Requirements and start commands

Requires Node.js 20.19 or later (or Node.js 22.12+) and npm. From this directory:

```bash
cd buglab
npm install
cp .env.example .env
```

Start the API in terminal 1:

```bash
cd buglab
npm run dev:api
```

Start the UI in terminal 2:

```bash
cd buglab
npm run dev:web
```

Open **http://127.0.0.1:4173**. API health is at **http://127.0.0.1:4317/health**. The API listens on `BUGLAB_HOST` (loopback values only) and `BUGLAB_PORT` (default `4317`). Vite's `/api` proxy uses `VITE_BUGLAB_API_PROXY` (default `http://127.0.0.1:4317`). Set a unique `BUGLAB_RESET_TOKEN` of at least 32 characters in `buglab/.env` to enable the ReproProof verifier reset route; the example placeholder is rejected and reset returns `503` until a strong value is set. The token must match `VERIFICATION_RESET_TOKEN` in `reproproof-api/.env`. `.env.example` contains placeholders only.

## Scenarios

| ID | Starting state and steps | Expected / observed result |
| --- | --- | --- |
| **TC1** | Reset the sandbox. On the home page, add Alpine Trail Backpack twice, open the cart, and inspect the subtotal. | Expected: $128.00 for two $64.00 items. Observed: quantity is 2 but subtotal is $64.00. The same stable fingerprint is generated after each reset. |
| **TC2** | Reset the sandbox. Add Alpine Trail Backpack once, open the cart, and inspect the subtotal. | Expected: $64.00. Observed: $64.00, with no TC1 failure marker. This is a repeatable `not_reproduced` case for the report “subtotal resets to zero after adding one item.” |
| **TC3** | Open Sandbox, select a disposable record, review its ID, enter the exact confirmation phrase, approve, then separately execute the approval. | Only the exact approved synthetic record IDs may be removed. Approval expires after five minutes, binds to the current seeded state and IDs, and is consumed once. Unapproved, expired, altered, replayed, or stale requests fail. Reset restores the three original synthetic records. |
| **TC4** | Open Test scenarios → TC4 and load the synthetic token. Inspect the page DOM and the safe test log export. | The nonfunctional value `TEST_TOKEN_DO_NOT_USE_1234567890` is present in the DOM for controlled detection. Its rendered text uses Chromium text masking and `data-sensitive="true"`; stored logs and exported JSON redact it and Bearer/query variants. |

The deliberately incorrect cart formula is isolated in `server/fixtures.ts` and applies only to this one seeded product. TC1 and TC2 tests assert cart state and stable fingerprints rather than treating a successful HTTP response as proof. Scenario definitions and exact reproduction instructions are in `shared/scenarios.ts`.

## Reset and API

Use the Sandbox page's **Reset sandbox** button, or call the loopback-only UI reset with the exact configured UI origin:

```bash
curl -X POST http://127.0.0.1:4317/api/sandbox/ui-reset \
  -H 'Origin: http://127.0.0.1:4173' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

For ReproProof's verifier, `POST /api/sandbox/reset` accepts only `{ "runId": "…", "bugReportId": "…" }` and requires `Authorization: Bearer <BUGLAB_RESET_TOKEN>`. It resets only BugLab's in-memory synthetic store. Other useful local endpoints are `GET /api/scenarios`, `GET /api/sandbox/records`, and `GET /api/test-logs/export`.

TC3 routes are `POST /api/sandbox/deletion-approvals` and `POST /api/sandbox/records/delete`. Approval binds the fixed `delete_records` action, exact selected IDs and seeded record contents, current state version, and SHA-256 plan hash. The request requires the exact displayed phrase, such as `DELETE 1 SANDBOX RECORD`; execution must present the returned approval ID, action, IDs, version, and hash. Approval expires after five minutes and is consumed before deletion; reset, changed records, stale versions, mismatched parameters, and replay fail closed. Both browser actions require an exact configured local `Origin`; requests are loopback-only. Records and approvals are process-memory only, so restart discards approvals and restores fixtures. This is a local demo safeguard, not authenticated multi-user approval: a local process can spoof an Origin header, so do not expose the API or treat this as production identity verification.

BugLab has no browser agent/execution endpoint and accepts no arbitrary target URL for navigation. Its UI uses fixed same-origin routes and its API uses fixed local fixtures. There is no external browser target allowlist to configure. If arbitrary target browsing is added later, enforce exact HTTPS origin allowlists and network egress controls in the server-side runner.

## Automated checks

```bash
cd buglab
../node_modules/.bin/eslint .
npm run build
npm run test:api
npx playwright install chromium   # one-time browser download
npm run test:e2e
```

`test:api` checks health, deterministic reset, repeated TC1 failure fingerprints, the clean TC2 behavior, TC3 approval binding/origin checks/staleness/replay/reset, TC4 redaction, and invalid requests. `test:e2e` builds the UI and exercises TC1–TC4 in Chromium against the actual React application and API, including that evidence under `artifacts/` is not web-served.

## Connect to the existing ReproProof app

BugLab is connected to the existing ReproProof workflow through the normal bug report and run APIs. `GET /api/demo/buglab` exposes the operator-configured demo origin to the intake form. The server accepts scenario markers only for the exact configured origin and documented TC route. ReproProof's planner generates the action plan, its own authenticated approval gate records the plan hash, and its existing durable worker runs it.

For the Docker Compose demo on macOS, keep BugLab's API on host loopback and bind only its Vite web server to all host interfaces. Docker's ReproProof worker reaches the Vite server through `host.docker.internal`; Vite proxies `/api` back to the loopback BugLab API. Configure `BUGLAB_UI_ORIGINS=http://host.docker.internal:4173,http://localhost:4173,http://127.0.0.1:4173` in `buglab/.env`. In the root ReproProof `.env`, set `BUGLAB_BASE_URL` and `ALLOWED_TARGET_ORIGINS` to `http://host.docker.internal:4173`, set `ALLOWED_RESOURCE_ORIGINS` to the same origin, enable `ALLOW_INSECURE_LOCAL_TARGETS=true` only with `APP_ENV=development`, and set `VERIFICATION_RESET_URL=http://host.docker.internal:4173/api/sandbox/reset`. Use the same random `BUGLAB_RESET_TOKEN` in both `buglab/.env` and the root `VERIFICATION_RESET_TOKEN`. The host web server must be reachable from Docker; BugLab's API stays loopback-bound. ReproProof's durable queue still requires its Supabase schema and credentials; without them, execution returns `503`.

Start BugLab's API and UI in separate terminals:

```bash
cd buglab
npm ci
npm run dev:api
```

```bash
cd buglab
BUGLAB_WEB_HOST=0.0.0.0 npm run dev:web
```

Then start ReproProof from the repository root with `docker compose up --build`. Open `http://localhost:8080`, choose a BugLab scenario on New Bug Report, submit it, inspect the generated plan, approve it, and start the browser run. The frontend and backend APIs remain the existing ReproProof contracts; `environment.demoScenario` is an optional typed marker added to the report environment.

```dotenv
APP_ENV=development
ALLOW_INSECURE_LOCAL_TARGETS=true
ALLOWED_TARGET_ORIGINS=http://127.0.0.1:4173
ALLOWED_RESOURCE_ORIGINS=http://127.0.0.1:4173
VERIFICATION_RESET_URL=http://127.0.0.1:4173/api/sandbox/reset
VERIFICATION_RESET_TOKEN=your-local-test-secret
```

Restart the ReproProof API after changing its environment. These settings intentionally allow one local HTTP origin only and must not be used in production. Start BugLab's API and UI, reset the sandbox, then submit a report through ReproProof.

Example TC1 report (use the literal field names below):

```json
{
  "title": "Duplicate cart item undercounts subtotal",
  "description": "Adding the seeded backpack twice increments quantity but leaves the subtotal at one unit.",
  "steps": [
    { "order": 1, "instruction": "Open http://127.0.0.1:4173/" },
    { "order": 2, "instruction": "Click Add Alpine Trail Backpack to cart" },
    { "order": 3, "instruction": "Click Add Alpine Trail Backpack to cart" },
    { "order": 4, "instruction": "Click Open cart" },
    { "order": 5, "instruction": "Screenshot the cart subtotal" }
  ],
  "expectedBehavior": "Cart subtotal equals unit price multiplied by quantity.",
  "actualBehavior": "Cart subtotal omits the second item's price.",
  "environment": { "targetUrl": "http://127.0.0.1:4173/", "browser": "chromium" }
}
```

Create a run with `POST /api/runs` and the returned bug report ID, review and approve the exact plan in ReproProof, then queue it. The report's target is the Vite origin; the reset endpoint is same-origin through Vite's proxy, matching ReproProof's current reset policy.

TC2's reproduction uses one add, then **Open cart** and a screenshot. Its reported actual behavior should be `The subtotal resets to zero after adding one item.` The clean UI does not display that phrase, so a fully completed run should return `not_reproduced`.

TC3's destructive actions remain constrained to the configured BugLab origin and `/sandbox` route, with a second approval at BugLab bound to exact action, record IDs, state version, and plan hash. TC4 uses only its synthetic fixture. ReproProof masks the `[data-sensitive="true"]` element in screenshots and sanitizes text evidence. The approved synthetic TC1 scenario may record video, but those recordings stay local and restricted because reliable frame-level redaction is unavailable; TC2–TC4 remain video-free.

## Safety boundaries and limits

- All records, product details, profiles, and token-like values are synthetic. No real account, payment, database, or external service is involved.
- Bindings are loopback-only; no remote deployment is configured or claimed. Do not expose this demo publicly. A staging deployment needs an authenticated, network-restricted reverse proxy plus a deployment review of all destructive/reset routes.
- The reset route can restore only BugLab's in-memory fixtures. It cannot address an external database or target.
- TC1 is deliberately defective and must not be presented as a production store behavior.
- TC4's fake token is intentionally rendered in the test page DOM. The API response does not return it. BugLab redacts recognized token patterns and configured secrets from log ingestion, types, and downloads; this does not establish universal redaction for unknown secret formats or recorded pixels.
- ReproProof permits the narrowly scoped TC3 scenario only when the server-side BugLab origin and route match configuration; BugLab's independent one-time destructive approval remains mandatory.
- There is no public URL, hosted instance, or judge credential. Evidence is local; BugLab has no remote storage, signed-link, or sharing endpoint. Approval state is in-memory and Origin checking is not authentication. Use a local walkthrough or deploy an isolated copy only after adding server-verified user identity, durable approvals, and a reviewed private evidence store.
