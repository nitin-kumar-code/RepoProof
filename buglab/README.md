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

Open **http://127.0.0.1:4173**. API health is at **http://127.0.0.1:4317/health**. The API listens on `BUGLAB_HOST` (loopback values only) and `BUGLAB_PORT` (default `4317`). Vite's `/api` proxy uses `VITE_BUGLAB_API_PROXY` (default `http://127.0.0.1:4317`). The optional `BUGLAB_RESET_TOKEN` protects the ReproProof reset route when configured. No value is needed for a loopback-only local demo. `.env.example` contains placeholders only.

## Scenarios

| ID | Starting state and steps | Expected / observed result |
| --- | --- | --- |
| **TC1** | Reset the sandbox. On the home page, add Alpine Trail Backpack twice, open the cart, and inspect the subtotal. | Expected: $128.00 for two $64.00 items. Observed: quantity is 2 but subtotal is $64.00. The same stable fingerprint is generated after each reset. |
| **TC2** | Reset the sandbox. Add Alpine Trail Backpack once, open the cart, and inspect the subtotal. | Expected: $64.00. Observed: $64.00, with no TC1 failure marker. This is a repeatable `not_reproduced` case for the report “subtotal resets to zero after adding one item.” |
| **TC3** | Open Sandbox, select a disposable record, review its ID, enter the exact confirmation phrase, approve, then separately execute the approval. | Only the exact approved synthetic record IDs may be removed. Approval expires after five minutes, binds to the current seeded state and IDs, and is consumed once. Unapproved, expired, altered, replayed, or stale requests fail. Reset restores the three original synthetic records. |
| **TC4** | Open Test scenarios → TC4 and load the synthetic token. Inspect the page DOM and the safe test log export. | The nonfunctional value `TEST_TOKEN_DO_NOT_USE_1234567890` is present in the DOM for controlled detection. Its rendered text uses Chromium text masking and `data-sensitive="true"`; stored logs and exported JSON redact it and Bearer/query variants. |

The deliberately incorrect cart formula is isolated in `server/fixtures.ts` and applies only to this one seeded product. TC1 and TC2 tests assert cart state and stable fingerprints rather than treating a successful HTTP response as proof. Scenario definitions and exact reproduction instructions are in `shared/scenarios.ts`.

## Reset and API

Use the Sandbox page's **Reset sandbox** button, or call the loopback-only UI reset:

```bash
curl -X POST http://127.0.0.1:4317/api/sandbox/ui-reset
```

For ReproProof's verifier, `POST /api/sandbox/reset` accepts `{ "runId": "…", "bugReportId": "…" }` and returns `{ "reset": true }`. If `BUGLAB_RESET_TOKEN` is set, send it as `Authorization: Bearer …`. It resets only BugLab's in-memory synthetic store. Other useful local endpoints are `GET /api/scenarios`, `GET /api/sandbox/records`, and `GET /api/test-logs/export`.

TC3 routes are `POST /api/sandbox/deletion-approvals` and `POST /api/sandbox/records/delete`. An approval request must contain the selected `recordIds` and the exact displayed phrase such as `DELETE 1 SANDBOX RECORD`. The follow-up delete request must contain the returned `approvalId` and precisely the same IDs. These routes reject malformed IDs and any request from a non-loopback client. A UI dialog is not the security boundary; the API validates and consumes the approval.

## Automated checks

```bash
cd buglab
../node_modules/.bin/eslint .
npm run build
npm run test:api
npx playwright install chromium   # one-time browser download
npm run test:e2e
```

`test:api` checks health, deterministic reset, repeated TC1 failure fingerprints, the clean TC2 behavior, TC3 authorization/staleness/replay/reset, TC4 redaction, and invalid requests. `test:e2e` builds the UI and exercises TC1–TC4 in Chromium against the actual React application and API.

## Connect to the existing ReproProof app

For this loopback-only target, run the ReproProof API/worker directly on the same host as BugLab (`cd reproproof-api && npm run dev`), rather than inside its Docker container. A container's `127.0.0.1` is the container itself and cannot reach BugLab's loopback listener. The ReproProof Playwright worker must be able to reach the BugLab Vite origin at `http://127.0.0.1:4173`; the Vite server proxies API calls and reset requests to BugLab's `4317` API. ReproProof's durable execution queue also requires its Supabase schema and credentials; without them, its execute endpoint intentionally returns `503`. For local development only, add these values to `reproproof-api/.env`:

```dotenv
APP_ENV=development
ALLOW_INSECURE_LOCAL_TARGETS=true
ALLOWED_TARGET_ORIGINS=http://127.0.0.1:4173
ALLOWED_RESOURCE_ORIGINS=http://127.0.0.1:4173
VERIFICATION_RESET_URL=http://127.0.0.1:4173/api/sandbox/reset
# Optional; if set, use the same value in buglab/.env as BUGLAB_RESET_TOKEN.
# VERIFICATION_RESET_TOKEN=your-local-test-secret
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

The current ReproProof planner deliberately turns delete/remove/reset instructions into clarification-only steps. Therefore TC3 is demonstrated through BugLab's own approval UI and API tests; it is not executable as a browser deletion plan through today's ReproProof policy. Do not weaken that safeguard for a demo. TC4 can be inspected through a ReproProof browser run, but only share its evidence after confirming the recording visually masks the output. ReproProof masks `[data-sensitive="true"]` on screenshots; its current video recording is not pixel-redacted after capture. BugLab's downloadable log export is sanitized, but browser recordings must remain private if their visual masking is uncertain.

## Safety boundaries and limits

- All records, product details, profiles, and token-like values are synthetic. No real account, payment, database, or external service is involved.
- Bindings are loopback-only; no remote deployment is configured or claimed. Do not expose this demo publicly. A staging deployment needs an authenticated, network-restricted reverse proxy plus a deployment review of all destructive/reset routes.
- The reset route can restore only BugLab's in-memory fixtures. It cannot address an external database or target.
- TC1 is deliberately defective and must not be presented as a production store behavior.
- TC4's fake token is intentionally returned to the test page DOM. BugLab redacts all log ingestion and log downloads; the raw response itself is only for this controlled local scenario.
- ReproProof currently refuses to plan destructive browser steps. TC3's backend approval gate remains enforced regardless of UI behavior.
- There is no public URL, hosted instance, or judge credential. Use a local walkthrough or deploy an isolated copy only after adding an authenticated boundary.
