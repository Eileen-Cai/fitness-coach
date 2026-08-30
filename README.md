# Fitness Coach

An evidence-based fitness coaching chat — lifting, yoga, mobility, and balanced nutrition.
A Next.js front-end over an n8n AI Agent workflow. The conversation reads like a coach's
training log: each reply builds on the last.

## Develop

```bash
cp .env.example .env.local     # points at http://localhost:5678 by default
npm install
npm run dev                    # http://localhost:3000
```

The n8n "Fitness Coach" workflow must be **active** on the instance named in
`N8N_WEBHOOK_BASE_URL`. The browser talks only to `/api/coach`, which proxies to n8n
server-side — the n8n URL and any token never reach the client.

## How it fits together

```
browser  ──POST /api/coach──▶  app/api/coach/route.ts  ──▶  lib/n8n.ts  ──▶  n8n webhook
         { message, sessionId }        (validate)          (fetch, 120s)      /webhook/fitness-coach
```

Request/response contract and the workflow graph: [CLAUDE.md](./CLAUDE.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · next-themes ·
react-markdown. Session id and transcript persist in `localStorage`; server-side
conversation memory is keyed by that session id.
