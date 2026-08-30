# fitness-coach

An evidence-based fitness coaching chat, backed by an n8n AI Agent workflow, with a
localStorage progression panel (XP / level / daily streak / milestones) to pull people back.
Next.js 16 (App Router) · TypeScript · Tailwind v4 · Geist + Newsreader · next-themes ·
react-markdown · Vitest.

## Deployment (Phase 3)

- **Live:** https://fitness-coach-eileen10.vercel.app
- **Vercel project:** `fitness-coach` (team `eileen10`, `prj_EWIF54X1fXPbNQRr6TzWTgSOxQDj`)
- **GitHub:** https://github.com/Eileen-Cai/fitness-coach (private, `main`)
- **Vercel env** (Production + Preview): `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_PATH`
- **Deployment Protection:** Vercel Authentication is set to **preview-only** — production is
  public, preview URLs require Vercel login.

### n8n is reached through an ngrok tunnel

Production `N8N_WEBHOOK_BASE_URL` points at an **ngrok** tunnel in front of local Docker n8n:
`https://footsore-spider-thermal.ngrok-free.dev`. This URL is **ephemeral** — it changes
whenever the `ngrok http 5678` process restarts or the Mac sleeps. When it changes:

```bash
cd apps/fitness-coach
printf '%s' "<new-ngrok-url>" | vercel env add N8N_WEBHOOK_BASE_URL production --force
printf '%s' "<new-ngrok-url>" | vercel env add N8N_WEBHOOK_BASE_URL preview    --force
vercel --prod
```

For a lasting setup: reserve an ngrok static domain, or move n8n to an always-on host and
re-run the workflow checklist against it.

### Redeploy

`vercel --prod` from this folder. **Auto-deploy on `git push` is not wired up yet** —
`vercel git connect` failed because the Vercel GitHub App isn't authorized on the repo. To
enable it: Vercel dashboard → project → Settings → Git → connect `Eileen-Cai/fitness-coach`
(completes the GitHub App install). After that, pushes to `main` deploy automatically.

## Front-end

```
app/
  layout.tsx            fonts (Geist Sans / Geist Mono for UI+data, Newsreader for coach voice), ThemeProvider
  page.tsx              server shell → <CoachChat/>
  globals.css           "quiet product UI" design tokens, .prose-log, 3 motion cues
  api/coach/route.ts    POST proxy: validates body, clamps optional stats, calls lib/n8n
components/
  coach-chat.tsx        the full client shell — header, transcript, composer, toasts, rail/sheet
  progress-rail.tsx     desktop right rail + shared <ProgressPanel/>
  progress-sheet.tsx    mobile: slim stat bar under the header + bottom sheet
  level-ring.tsx        the 270° tick-marked gauge (the one accent moment)
  markdown.tsx          react-markdown + remark-gfm, rendered inside .prose-log
  theme-provider.tsx    next-themes, follows system light/dark
hooks/
  use-progress.ts       localStorage-backed progression (key: fitness-coach.progress.v1)
lib/
  n8n.ts                server-only bridge to the n8n webhook (timeout, error shaping, stats passthrough)
  progress.ts           pure XP/level/streak/achievement engine
  progress.test.ts      19 unit tests — `npm run test`
```

**Design — "quiet product UI".** Near-monochrome, hairline structure, generous whitespace.
A single green accent appears only on the progress gauge, the streak, Send, and milestone
ticks. Geist for UI and all numerals (tabular); Newsreader is the one serif, reserved for
the coach's spoken replies. No chat bubbles — turns are label-led (`You` / `Coach`).
Light/dark follow the OS. Deliberately avoids the AI-generated look: no gradients,
glassmorphism, purple/blue, emoji-as-UI, bento grids, or shadow soup.

**Gamification (all client-side, `localStorage`).** XP is earned only on a *successful*
coach reply — `+12`, `+18` for the first reply of a local day. Escalating level curve
(`xpThreshold`: 0 / 60 / 160 / 300 / 480 …). A daily streak counts consecutive local days.
Seven one-time milestones detected from the transcript. On level-up: the gauge ticks and an
inline `— Level N · X questions in` line drops into the log; on a milestone: one 3s toast +
a rail-row flash. The front-end also sends `{ level, streak, messages }` to the workflow so
the coach can acknowledge milestones — see the data contract. Nothing is locked. Progress is
per-device; clearing site data resets it.

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
`npm run test` runs the progression unit tests.

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

The agent's `text` (prompt) is an expression that prefixes a one-line member-context block
(`level {{ ($json.body.stats||{}).level||0 }}, …`) before `{{ $json.body.message }}`, so
the coach sees the viewer's progression without a new node. Absent `stats` → all zeros.

## Data contract

### Request — `POST /webhook/fitness-coach`

`Content-Type: application/json`

| Field       | Type   | Required | Notes                                                                 |
|-------------|--------|----------|----------------------------------------------------------------------|
| `message`   | string | yes      | The user's message. 1–4000 characters.                              |
| `sessionId` | string | yes      | Stable per-conversation ID. Front-end generates a UUID once and persists it (localStorage). Drives server-side memory. |
| `stats`     | object | no       | `{ level, streak, messages }` — the viewer's progression. The agent prompt is prefixed with a one-line "member context" so it can nod to milestones. Missing/garbage → treated as zeros; the request never fails on `stats`. |

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

Shipped. `n8n_validate_workflow` → 0 errors; workflow active. Verified live:

- `200` happy path returns `{ reply, sessionId }`; `400` / `500` paths correct.
- Memory works — a second turn on the same `sessionId` recalls facts from the first.
- `stats` in the body → coach references the streak; **no** `stats` → still `200` (backward compatible).
- Front-end: `npm run test` (19) + `npm run build` pass. In-browser against local n8n — sending
  a message increments rail XP, crossing a threshold ticks the level and drops the inline marker,
  `first-plan` milestone unlocks off a structured reply. Light/dark + mobile bottom sheet checked.

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

## Follow-ups

- Wire `vercel git connect` (dashboard) so `git push` auto-deploys — see Deployment above.
- Reserve an ngrok static domain (or move n8n off the laptop) so the public URL is stable.
- Fund OpenRouter and switch the model to `anthropic/claude-sonnet-5` (see Model note).
