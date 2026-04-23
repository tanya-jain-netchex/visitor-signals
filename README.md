# Netchex Visitor Signals

Turns anonymous RB2B-identified website visitors into qualified sales leads. Ingests visitor identification webhooks, enriches profiles through Clay (or Apify as fallback), scores them against a configurable ICP rubric, generates personalized outreach in the voice of Netchex SDRs, and optionally dedupes against Salesforce + Gong so reps never start a conversation from zero.

Built as an internal demo for the Netchex GTM team.

---

## What it does

1. **Ingests** visitor identification events from RB2B (webhook) or a CSV export.
2. **Enriches** each visitor via Clay (primary) or Apify (fallback) — work email, title, LinkedIn, company size, revenue band, industry.
3. **Scores** against a 100-point ICP rubric (firmographics, intent, persona fit, capacity) with hard disqualifiers for free-email domains, competitors, and internal traffic.
4. **Qualifies** into Tier 1 / Tier 2 / Tier 3 so SDRs know where to start.
5. **Resolves** each visitor to an existing Salesforce Lead/Contact via Gong's CRM mapping (on-demand) — shows the SF link + count of prior Gong calls/emails.
6. **Generates** a personalized outbound email through the configured LLM provider using a prompt template tuned to real Netchex SDR voice (peer-operator tone, short sentences, industry social proof, question CTAs).
7. **Ships** the email. Copy to clipboard, push into a Gong Engage Flow (live or simulated, gated by a feature flag), or sync as a new Lead / Task to Salesforce.

See [`DEMO.md`](./DEMO.md) for the walkthrough we use when showing this to stakeholders.

---

## Tech stack

Next.js 15 (App Router) · TypeScript · Prisma 7 · PostgreSQL 16 · shadcn/ui (Zinc theme) · Gemini 2.5 Flash / Claude Sonnet / gpt-4o-mini (pluggable) · Docker Compose · ngrok.

---

## Prerequisites

- **Docker Desktop** — runs PostgreSQL
- **Node.js 20+** — runs the Next.js app
- **ngrok** account with an auth token — exposes localhost so RB2B webhooks can reach you
- **At least one LLM API key** (OpenAI, Anthropic, or Gemini) — for email generation
- **Clay workspace** (optional but recommended) — primary enrichment
- **Apify token** (optional) — fallback enrichment
- **Gong Access Key + Secret** (optional) — CRM dedup + prior-activity lookup
- **Salesforce Connected App** OAuth creds (optional) — Lead / Activity sync

Nothing outside this list is required to run the demo. The app boots with a seeded 351-row RB2B dataset and works end-to-end with just an LLM key.

---

## Quick start (local dev)

### 1. Clone + install

```bash
git clone https://github.com/<your-org>/<your-repo>.git
cd <your-repo>
npm install
```

### 2. Boot PostgreSQL

```bash
docker compose up -d
```

This starts a `netchex-postgres` container on `localhost:5432` with a named volume for data persistence.

### 3. Configure env vars

```bash
cp .env.example .env
```

Edit `.env` — you MUST set:

| Variable | How to generate |
|---|---|
| `APP_PASSWORD` | any string — protects the login page |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` — AES-256-GCM key for encrypted secrets at rest |
| `DATABASE_URL` | leave as-is unless you changed `docker-compose.yml` |

Everything else (Clay, Apify, Salesforce, Gong, LLM keys) is configured through the Settings UI after login, **never** in `.env`. Secrets are encrypted with AES-256-GCM before being written to the DB.

### 4. Migrate + seed

```bash
npx prisma migrate dev
npx prisma db seed
```

The seed loads 351 real-world RB2B sample visitors + a default ICP config tuned for Netchex's TAM.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, log in with your `APP_PASSWORD`, and you should see the dashboard.

---

## Exposing the webhook to RB2B

RB2B posts to a public URL. Locally that means ngrok (or an alternative tunneling tool — see below).

### ngrok (recommended for demos)

```bash
# First-time setup
brew install ngrok
ngrok config add-authtoken <your-token>

# Every time you demo
ngrok http 3000
```

Copy the forwarding URL ngrok prints (looks like `https://abc-12-34-56-78.ngrok-free.app`) and set it in RB2B:

```
<forwarding-url>/api/webhook/rb2b
```

Test with:

```bash
curl -X POST <forwarding-url>/api/webhook/rb2b \
  -H "Content-Type: application/json" \
  -d @prisma/seed-data/sample-rb2b-event.json
```

Free-tier ngrok URLs change on every restart — you'll need to update RB2B each time. Pay tier gives you a static subdomain, which is worth it if you demo often.

### Alternatives to ngrok

| Tool | When to pick it |
|---|---|
| **Cloudflare Tunnel** (free, `cloudflared`) | Stable hostname, no session timeouts, runs as a service. Good for always-on internal staging. |
| **Tailscale Funnel** (free for personal) | If your team already runs Tailscale, exposing a single port is one command. Hostnames are stable per-machine. |
| **localtunnel** / **bore.pub** | Dead simple, but URLs rotate and reliability is hit-or-miss. Fine for a one-off test. |
| **Deploy to Vercel / Fly / Railway** | When you stop demoing from a laptop. See the [Production section](#going-to-production) below. |

---

## Configuring integrations

Everything is in **Settings** (`/settings` after login):

| Section | What it's for |
|---|---|
| **Clay** | Primary enrichment. Paste the inbound webhook URL from your Clay table's source. In Clay, add an HTTP API column that POSTs back to `/api/webhook/clay/results`. |
| **Apify** | Fallback LinkedIn profile scraper. Only an API token is needed — actor is hardcoded (`harvestapi~linkedin-profile-scraper`). |
| **LLM Provider** | Pick `openai` / `anthropic` / `gemini`, paste a key. Gemini 2.5 Flash is the default in the demo — cheapest, fastest, good enough. |
| **Salesforce** | Instance URL + Connected App Client ID/Secret + Refresh Token. Refresh-token OAuth flow — see Salesforce Setup → App Manager → New Connected App. |
| **Gong Engage** | Base URL (`https://us-xxxxx.api.gong.io`) + Access Key + Access Key Secret + optional default Flow ID. Reads (CRM mapping, prior calls/emails, last touchpoint) are always live. |
| **Gong Engage — Live Send** | Feature flag. OFF by default → the "Send via Gong Engage" button records a simulated marker only. ON → performs a real `POST /v2/flows/{flowId}/assignees` to add the prospect to the configured Gong Flow. Requires a Default Flow ID set in the Gong Engage section. |
| **ICP Scoring Rules** | Target industries, buyer-persona titles, disqualifier domains, and the qualification threshold (default 50). |
| **Outreach Email Prompt** | The exact prompt sent to the LLM. Ships with a tone profile derived from real Netchex SDR emails (peer-operator voice, 85–95 word bodies, industry social proof). |

All secrets encrypted at rest — the settings UI only shows the last 4 characters after save.

---

## ICP scoring rubric

| Category | Max | Rules |
|---|---|---|
| Firmographics | 40 | Industry match (20), Company size 50–500 (10), US-based (10) |
| Intent | 30 | Page intent tier (20), Pricing/demo page bonus (10) |
| Persona fit | 20 | Title match (15), Has LinkedIn URL (5) |
| Capacity | 10 | Revenue band (5), Multiple visits (5) |

**Tiers:** 75+ = Tier 1 (immediate outreach) · 50–74 = Tier 2 (nurture) · <50 = Tier 3 (monitor).

Hard disqualifiers zero the score: free-email domain, known competitor, missing both email and LinkedIn, internal IP ranges.

Scores are snapshotted at the time of processing. Changing the threshold in Settings afterwards does NOT retroactively re-score; use the admin rescore endpoint (`POST /api/admin/rescore`, top-50 cap) if you intentionally want to sweep.

---

## API surface

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/webhook/rb2b` | POST | Ingest an RB2B identification event | Public |
| `/api/webhook/clay/results` | POST | Receive Clay HTTP API callback | Public |
| `/api/import/csv` | POST | Bulk CSV import | Cookie |
| `/api/visitors` | GET | List + filter visitors | Cookie |
| `/api/visitors/:id` | GET | Visitor detail with all relations | Cookie |
| `/api/visitors/:id/score` | POST | Re-enrich + re-score one visitor | Cookie |
| `/api/visitors/:id/outreach` | POST | Generate personalized email | Cookie |
| `/api/visitors/:id/outreach/:msgId/send-gong` | POST | **Simulated** Gong Engage push | Cookie |
| `/api/visitors/:id/gong` | POST | Refresh Gong/SF cache for this visitor | Cookie |
| `/api/icp-config` | GET/PUT | Manage ICP scoring rules | Cookie |
| `/api/prompt-template` | GET/PUT | Manage outreach prompt | Cookie |
| `/api/settings` | GET/PUT | Manage integration credentials | Cookie |
| `/api/admin/rescore` | POST | Bulk rescore top N (default 50, max 500) | Cookie |

Webhook routes are public by design — RB2B and Clay can't authenticate. Everything else requires the `netchex-auth` session cookie.

---

## Project structure

```
src/
├── app/
│   ├── api/              # All server routes — webhooks, REST, admin
│   ├── dashboard/        # Visitor list + stats
│   ├── login/            # Password gate
│   ├── settings/         # Integrations UI + ICP rules + prompt editor
│   └── visitors/[id]/    # Visitor detail with SF/Gong card + outreach panel
├── components/
│   ├── dashboard/        # Stats cards, visitor table, status badges
│   ├── layout/           # Sidebar, header
│   └── ui/               # shadcn primitives
├── lib/
│   ├── crypto.ts         # AES-256-GCM wrapper for AppSetting values
│   ├── email/            # LLM email generation + Netchex product context
│   ├── enrichment/       # Clay webhook push + Apify LinkedIn scraper
│   ├── gong/             # Gong REST client (CRM lookup, prior activity, sim-send)
│   ├── pipeline/         # Visitor processing orchestrator
│   ├── salesforce/       # OAuth refresh + Lead/Task sync
│   ├── scoring/          # ICP rules engine + disqualifiers
│   └── webhook/          # RB2B payload parser
├── middleware.ts         # Cookie-based auth guard
└── types/
prisma/
├── schema.prisma         # Visitor · EnrichmentResult · IcpScore · OutreachMessage · AppSetting · IcpConfig · SfSyncLog
├── migrations/
├── seed.ts               # Seeds 351 sample visitors + ICP config
└── seed-data/
    └── rb2b-export.csv
```

---

## Run everything in Docker

For a one-command demo stack, uncomment the `app` service in `docker-compose.yml` and run:

```bash
docker compose up --build
```

This gives you PostgreSQL + the Next.js app in one command. You'll still need to pass `APP_PASSWORD` and `ENCRYPTION_KEY` as env vars — read them from your `.env`:

```bash
docker compose --env-file .env up --build
```

---

## Going to production

The dev stack (laptop + ngrok + Docker) is fine for sales demos. For anything beyond that:

### Hosting

| Option | Fit |
|---|---|
| **Vercel** | Easiest. One-click Next.js deploy. Add a managed Postgres (Vercel Postgres / Neon / Supabase). Env vars in dashboard. Good up to modest webhook volume. |
| **Fly.io / Railway** | Similar ergonomics to Vercel with long-running processes + a container you control. Better if Clay's callback latency varies or you need persistent jobs. |
| **AWS ECS + RDS / GCP Cloud Run + Cloud SQL** | When visitor volume crosses a few thousand events/day or you need VPC-level integration with an existing data lake. |

### Webhook reliability

RB2B will retry failed deliveries, but you want:

1. **A stable hostname** — no more ngrok rotation. Custom domain on Vercel, or Cloudflare in front of your own deploy.
2. **A queue between webhook and pipeline** — right now `/api/webhook/rb2b` processes inline. At scale, drop the payload into SQS / Cloud Tasks / Upstash QStash and have a worker drain it. Prevents a slow Clay call from timing out the webhook.
3. **Idempotency keys** — RB2B can deliver the same event twice. Hash the raw payload and skip duplicates.

### Enrichment + LLM cost control

- Cache Clay responses by email for 7 days — visitors often re-visit.
- Batch the daily rescore instead of doing per-visitor — already supported via `/api/admin/rescore` (capped at 50 by default; raise if your Clay credits allow).
- Run Gemini Flash for 95% of emails, only escalate to Claude/GPT-4 for Tier 1 leads.

### CRM integration hardening

- Move Salesforce OAuth from refresh-token flow to a long-running system user (Connected App with JWT bearer). Refresh tokens expire if the admin resets.
- Wire the "Send via Gong Engage" button to the real `POST /v2/flows/:flowId/prospects` endpoint once a compliance review signs off on outbound sends.
- Add SF activity logging for every generated email, not just successful syncs — so every touch is auditable.

### Observability

- Add structured logging (pino) + ship to Datadog / Axiom / Logtail.
- Trace the visitor pipeline with OpenTelemetry — enrichment latency is the usual bottleneck.
- Dashboard-level metric: time-from-RB2B-webhook-to-qualified-lead-in-SF. That's the number sales cares about.

### Auth

The single shared password is a demo-only solution. For internal rollout:

- Swap in SSO via your IdP — Auth.js with Google / Okta / Microsoft Entra takes an afternoon.
- Add per-user role (SDR / AE / admin) and gate the admin endpoints.

---

## Security notes

- `.env` is gitignored. Never commit real credentials.
- All integration secrets (Clay, Apify, SF, Gong, LLM keys) encrypted at rest in the `AppSetting` table via AES-256-GCM. Key comes from `ENCRYPTION_KEY` env — if you lose it, you lose every stored credential.
- Webhook routes are deliberately public; the rest of the app is gated by a `netchex-auth` httpOnly cookie.
- Cookie is set `secure` when NODE_ENV=production OR when `x-forwarded-proto=https` (so ngrok HTTPS works).

---

## License

Internal use only.
