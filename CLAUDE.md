# fitness-coach

An evidence-based fitness coaching chat, backed by an n8n AI Agent workflow.
Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui.

## Front-end (Phase 2)

```
app/
  layout.tsx            fonts (Newsreader / Hanken Grotesk / IBM Plex Mono), ThemeProvider
  page.tsx              server shell → <CoachChat/>
  globals.css           design tokens ("the training log"), .prose-log, motion
  api/coach/route.ts    POST proxy: validates body, calls lib/n8n, maps errors → status
components/
  coach-chat.tsx        the whole client UI (transcript, composer, localStorage session)
  markdown.tsx          react-markdown + remark-gfm, rendered inside .prose-log
  theme-provider.tsx    next-themes, follows system light/dark
lib/
  n8n.ts                server-only bridge to the n8n webhook (timeout, error shaping)
```

**Design.** A coaching *training log*, not a chat-bubble UI: mono margin index (`01`, `02`)
because each turn genuinely builds on the last (server-side memory); the athlete's own lines
in mono; the coach's replies in a serif voice inside a forest-green ruled panel. Warm paper,
hairline rules. Light/dark follow the OS.

**Run it locally**

```bash
cd apps/fitness-coach
cp .env.example .env.local          # defaults point at http://localhost:5678
npm install
npm run dev                         # http://localhost:3000  (n8n workflow must be active)
```

**Env** (`.env.local`, gitignored; see `.env.example`)

| Var | Required | Notes |
|-----|----------|-------|
| `N8N_WEBHOOK_BASE_URL` | yes | n8n origin. Dev: `http://localhost:5678`. Prod: the public n8n URL. |
| `N8N_WEBHOOK_PATH` | no | Defaults to `fitness-coach`. |
| `N8N_WEBHOOK_TOKEN` | no | Sent as `Authorization` if the webhook ever gets auth. |

The browser only ever calls `/api/coach` (same origin). The n8n URL stays server-side.

**Verified:** `npm run build` passes; example prompt → coach reply renders; a follow-up on
the same session recalls earlier facts — all in-browser against local n8n.

## Workflow (Phase 1)

- **n8n workflow:** `Fitness Coach` — ID `5qEuEXDzd0XuX2BQ`
- **Instance (dev):** local Docker n8n at `http://localhost:5678`
- **Webhook path:** `fitness-coach`
  - Production URL: `POST {N8N_BASE}/webhook/fitness-coach` (workflow must be **active**)
  - Test URL: `POST {N8N_BASE}/webhook-test/fitness-coach` (needs "Listen for test event" open in the editor)
- **Auth:** none on the webhook. The browser never calls n8n directly — the Next.js route
  (`app/api/coach/route.ts`) proxies server-side using `N8N_WEBHOOK_BASE_URL`. No CORS needed.
- **Response mode:** `responseNode` (every branch ends at a `Respond to Webhook`).

### Graph

```
Webhook (POST /fitness-coach)
  └─▶ Validate input (IF)
        ├─ valid   ─▶ Fitness Coach (AI Agent) ─┬─ ok    ─▶ Respond success (200)
        │                                       └─ error ─▶ Respond error (500)
        └─ invalid ─▶ Respond bad request (400)

OpenRouter Chat Model ──(ai_languageModel)──▶ Fitness Coach   [model: nvidia/nemotron-3-super-120b-a12b:free, retry 3×/5s]
Simple Memory         ──(ai_memory)─────────▶ Fitness Coach   [buffer window, 20 turns]
```

## Data contract

### Request — `POST /webhook/fitness-coach`

`Content-Type: application/json`

| Field       | Type   | Required | Notes                                                                 |
|-------------|--------|----------|----------------------------------------------------------------------|
| `message`   | string | yes      | The user's message. 1–4000 characters.                              |
| `sessionId` | string | yes      | Stable per-conversation ID. Front-end generates a UUID once and persists it (localStorage). Drives server-side memory. |

### Response `200`

```json
{ "reply": "…coach's answer…", "sessionId": "…echoed back…" }
```

### Response `400` — validation failure

```json
{ "error": "validation_error", "message": "'message' is required (1-4000 characters) and 'sessionId' is required." }
```

Triggered when `message` is missing/empty/over 4000 chars, or `sessionId` is missing/empty.

### Response `500` — internal / model failure

```json
{ "error": "internal_error", "message": "The coach is unavailable right now. Please try again shortly." }
```

Triggered by any failure inside the AI Agent (model error, OpenRouter outage/billing, timeout).
The real error is not leaked to the caller — inspect n8n executions for detail.

## Round-trip test

```bash
# 200
curl -sS -X POST http://localhost:5678/webhook/fitness-coach \
  -H 'Content-Type: application/json' \
  -d '{"message":"Beginner, 3 days/week, dumbbells only. Where do I start?","sessionId":"dev-1"}'

# 400
curl -sS -i -X POST http://localhost:5678/webhook/fitness-coach \
  -H 'Content-Type: application/json' -d '{"sessionId":"dev-1"}'
```

## Status

Phase 1 **complete**. `n8n_validate_workflow` → 0 errors; workflow active. Verified live:

- `200` happy path returns `{ reply, sessionId }`.
- Memory works — a second turn on the same `sessionId` recalls facts from the first.
- `400` on missing/invalid `message` or `sessionId`.
- `500` when the model call fails (verified against OpenRouter 402/404/429 while picking a model).

### Model note

Running on the free model `nvidia/nemotron-3-super-120b-a12b:free` because the OpenRouter
account (credential `openRouterApi` id `n73L6qIT3PJzg6YV`) has no credit — `anthropic/*`
models return `402 Payment required`, and the retired `anthropic/claude-3.5-sonnet` slug
returns `404`. Free models are rate-limited; the model node has `retryOnFail` (3×, 5s) to ride
out `429`s. To upgrade: add credit to OpenRouter and set `OpenRouter Chat Model → model` to
`anthropic/claude-sonnet-5`.

## Memory caveat

`Simple Memory` is in-process — it resets when n8n restarts and is not shared across n8n
instances. Fine for the demo; swap for `@n8n/n8n-nodes-langchain.memoryPostgresChat` (or
Redis) before real multi-user use.

## Next (Phase 3 — ship)

Give n8n a public URL (ngrok static domain / Cloudflare Tunnel in front of local Docker, or
move n8n to an always-on host), `git init` here, push to a GitHub repo, import to Vercel, set
`N8N_WEBHOOK_BASE_URL` to the public URL in Vercel env, deploy. See the workbench `CLAUDE.md`
and `docs/deploy-runbook.md`.
