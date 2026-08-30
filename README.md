# Fitness Coach

An evidence-based fitness coaching chat — lifting, yoga, mobility, and balanced nutrition —
over an n8n AI Agent workflow. A quiet, minimal product UI with a progression panel (XP,
level, daily streak, milestones) to keep people coming back. The coach's replies are the one
serif voice on the page; everything else is hairlines and whitespace.

## Develop

```bash
cp .env.example .env.local     # points at http://localhost:5678 by default
npm install
npm run dev                    # http://localhost:3000
npm run test                   # progression engine unit tests
```

The n8n "Fitness Coach" workflow must be **active** on the instance named in
`N8N_WEBHOOK_BASE_URL`. The browser talks only to `/api/coach`, which proxies to n8n
server-side — the n8n URL and any token never reach the client.

## How it fits together

```
browser ──POST /api/coach──▶ app/api/coach/route.ts ──▶ lib/n8n.ts ──▶ n8n webhook
      { message, sessionId, stats? }   (validate, clamp)   (fetch, 120s)   /webhook/fitness-coach
```

`stats` (`{ level, streak, messages }`) is derived from local progression and lets the coach
acknowledge milestones. It is optional — the workflow is backward-compatible without it.
Request/response contract and the workflow graph: [CLAUDE.md](./CLAUDE.md).

## Progression

Pure engine in [lib/progress.ts](./lib/progress.ts): XP on each successful reply (`+12`, `+18`
for the first of a local day), an escalating level curve, a consecutive-day streak, and seven
one-time milestones detected from the transcript. State lives in `localStorage` — per device,
no account. UI: a tick-marked gauge on the desktop rail, a slim stat bar + bottom sheet on
mobile.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Geist + Newsreader · next-themes ·
react-markdown · Vitest. Deployed on Vercel; n8n reached via a tunnel (see CLAUDE.md).
